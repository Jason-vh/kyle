import { eq } from "drizzle-orm";
import { createLogger } from "#server/logger.ts";
import { errorMessage } from "#server/errors.ts";
import { quotedEpisodeList, titleWithYear } from "#shared/media.ts";
import { runConversationTurn } from "#server/agent/conversation.ts";
import { saveWebhookNotification } from "#server/db/webhook-notifications.ts";
import { db } from "#server/db/index.ts";
import { notificationDeliveries } from "#server/db/schema.ts";
import { getSlackClient } from "#server/slack/client.ts";
import { sendDiscordMessageToChannel } from "#server/discord/messages.ts";
import type { MediaNotificationInfo, MediaRequester } from "./types.ts";

const log = createLogger("webhooks:notify");

export function describeMedia(media: MediaNotificationInfo): string {
  const title = titleWithYear(media.title, media.year);
  if (media.mediaType !== "series" || !media.episodes?.length) return title;
  return `${title} — ${quotedEpisodeList(media.episodes)}`;
}

function webhookPrompt(media: MediaNotificationInfo, source: "sonarr" | "radarr"): string {
  const service = source === "sonarr" ? "Sonarr" : "Radarr";
  const quality = media.quality
    ? ` (${media.quality}${media.releaseGroup ? ` · ${media.releaseGroup}` : ""})`
    : "";
  return `[Webhook — ${service}] ${describeMedia(media)}${quality} has finished downloading. Let the user know it's ready.`;
}

async function postReply(requester: MediaRequester, text: string): Promise<void> {
  if (requester.interfaceType === "slack") {
    await getSlackClient().chat.postMessage({
      channel: requester.channel,
      thread_ts: requester.threadTs,
      markdown_text: text,
      unfurl_links: false,
      unfurl_media: false,
    });
  } else {
    const sent = await sendDiscordMessageToChannel(requester.channelId, text);
    if (!sent) throw new Error("Discord notification could not be delivered");
  }
}

async function prepareReply(
  requester: MediaRequester,
  media: MediaNotificationInfo,
  deliveryId?: string,
): Promise<string> {
  const { conversationId, interfaceType } = requester;
  const source = media.mediaType === "movie" ? "radarr" : "sonarr";
  await saveWebhookNotification(
    conversationId,
    source,
    `${describeMedia(media)} has finished downloading.`,
    media,
    deliveryId,
  );
  const { responseText } = await runConversationTurn({
    interfaceType,
    conversationId,
    text: webhookPrompt(media, source),
    storePrompt: false,
    context: { interfaceType },
  });
  if (!responseText) throw new Error("Agent returned an empty notification");
  return responseText;
}

type Delivery = typeof notificationDeliveries.$inferSelect;

export async function deliverNotification(
  delivery: Delivery,
  media: MediaNotificationInfo,
  prepare: typeof prepareReply = prepareReply,
  post: typeof postReply = postReply,
): Promise<void> {
  if (delivery.sentAt) return;
  let text = delivery.responseText;
  if (!text) {
    text = await prepare(delivery.requester, media, delivery.id);
    await db
      .update(notificationDeliveries)
      .set({ responseText: text })
      .where(eq(notificationDeliveries.id, delivery.id));
  }
  await post(delivery.requester, text);
  await db
    .update(notificationDeliveries)
    .set({ sentAt: new Date() })
    .where(eq(notificationDeliveries.id, delivery.id));
}

export async function notifyRequesters(
  requesters: MediaRequester[],
  media: MediaNotificationInfo,
  jobId?: string,
): Promise<void> {
  const unique = [
    ...new Map(requesters.map((requester) => [requester.conversationId, requester])).values(),
  ];
  let results: PromiseSettledResult<void>[];
  if (jobId) {
    if (unique.length) {
      await db
        .insert(notificationDeliveries)
        .values(
          unique.map((requester) => ({
            jobId,
            conversationId: requester.conversationId,
            requester,
          })),
        )
        .onConflictDoNothing();
    }
    const deliveries = await db
      .select()
      .from(notificationDeliveries)
      .where(eq(notificationDeliveries.jobId, jobId));
    results = await Promise.allSettled(
      deliveries.map((delivery) => deliverNotification(delivery, media)),
    );
  } else {
    results = await Promise.allSettled(
      unique.map(async (requester) => {
        await postReply(requester, await prepareReply(requester, media));
      }),
    );
  }
  const failures = results.filter((result) => result.status === "rejected");
  for (const result of failures) {
    log.error("failed to notify requester", { jobId, error: errorMessage(result.reason) });
  }
  if (jobId && failures.length) {
    throw new AggregateError(
      failures.map((result) => result.reason),
      "Chat notifications failed",
    );
  }
}
