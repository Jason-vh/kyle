import { createLogger } from "../logger.ts";
import { errorMessage } from "../errors.ts";
import { quotedEpisodeList, titleWithYear } from "../../shared/media.ts";
import { runConversationTurn } from "../agent/conversation.ts";
import { saveWebhookNotification } from "../db/webhook-notifications.ts";
import { getSlackClient } from "../slack/client.ts";
import { sendDiscordMessageToChannel } from "../discord/messages.ts";
import type { MediaNotificationInfo, MediaRequester } from "./types.ts";

const log = createLogger("webhooks:notify");

/** `Severance (2022) — S01E01 "Good News"`, with the episode list when there is one. */
function describeMedia(media: MediaNotificationInfo): string {
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
    await sendDiscordMessageToChannel(requester.channelId, text);
  }
}

async function notifyRequester(
  requester: MediaRequester,
  media: MediaNotificationInfo,
  source: "sonarr" | "radarr",
): Promise<void> {
  const { conversationId, interfaceType } = requester;

  // Saved before the agent runs so its receivedAt precedes the assistant reply.
  saveWebhookNotification(
    conversationId,
    source,
    `${describeMedia(media)} has finished downloading.`,
    media,
  );

  log.info("running agent for webhook notification", {
    conversationId,
    interfaceType,
    title: media.title,
  });

  const { responseText } = await runConversationTurn({
    interfaceType,
    conversationId,
    text: webhookPrompt(media, source),
    // The notification block already shows what happened; the prompt would repeat it.
    storePrompt: false,
    context: { interfaceType },
  });

  if (!responseText) {
    log.warn("agent returned empty response for webhook notification", {
      conversationId,
      title: media.title,
    });
    return;
  }

  await postReply(requester, responseText);
  log.info("notified requester", { conversationId, interfaceType, title: media.title });
}

/** Notifies everyone who asked for this media, at most once per conversation. */
export async function notifyRequesters(
  requesters: MediaRequester[],
  media: MediaNotificationInfo,
): Promise<void> {
  if (requesters.length === 0) {
    log.info("no requesters to notify", { title: media.title });
    return;
  }

  const seen = new Set<string>();
  const unique = requesters.filter((r) => {
    if (seen.has(r.conversationId)) return false;
    seen.add(r.conversationId);
    return true;
  });

  const source = media.mediaType === "movie" ? "radarr" : "sonarr";
  const results = await Promise.allSettled(unique.map((r) => notifyRequester(r, media, source)));

  results.forEach((result, i) => {
    if (result.status !== "rejected") return;
    const requester = unique[i]!;
    log.error("failed to notify requester", {
      conversationId: requester.conversationId,
      interfaceType: requester.interfaceType,
      error: errorMessage(result.reason),
    });
  });
}
