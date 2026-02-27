import { eq, asc } from "drizzle-orm";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { AssistantMessage } from "@mariozechner/pi-ai";
import { createLogger } from "../logger.ts";
import { getSlackClient } from "../slack/client.ts";
import { db } from "../db/index.ts";
import { conversations, messages } from "../db/schema.ts";
import { findMediaRequesters } from "./requester.ts";
import { saveWebhookNotification, getWebhookNotifications } from "../db/webhook-notifications.ts";
import { runAgent } from "../agent/index.ts";
import type {
  RadarrWebhookPayload,
  SonarrWebhookPayload,
  MediaNotificationInfo,
  MediaRequester,
} from "./types.ts";

const log = createLogger("webhooks");

const BATCH_DELAY_MS = 30_000;

interface PendingBatch {
  media: MediaNotificationInfo;
  requesters: MediaRequester[];
  timer: ReturnType<typeof setTimeout>;
}

const pendingBatches = new Map<string, PendingBatch>();

function flushBatch(key: string): void {
  const batch = pendingBatches.get(key);
  if (!batch) return;
  pendingBatches.delete(key);
  notifyRequesters(batch.requesters, batch.media).catch((error) => {
    log.error("batched notification failed", {
      title: batch.media.title,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

function formatWebhookPrompt(media: MediaNotificationInfo, source: "sonarr" | "radarr"): string {
  const service = source === "sonarr" ? "Sonarr" : "Radarr";
  let desc = `${media.title} (${media.year})`;

  if (media.mediaType === "series" && media.episodes?.length) {
    const eps = media.episodes
      .map((e) => `S${String(e.seasonNumber).padStart(2, "0")}E${String(e.episodeNumber).padStart(2, "0")} "${e.title}"`)
      .join(", ");
    desc += ` — ${eps}`;
  }

  if (media.quality) {
    desc += ` (${media.quality}${media.releaseGroup ? ` · ${media.releaseGroup}` : ""})`;
  }

  return `[Webhook — ${service}] ${desc} has finished downloading. Let the user know it's ready.`;
}

function formatWebhookForContext(n: { source: string; message: string; receivedAt: Date }): string {
  const service = n.source === "sonarr" ? "Sonarr" : "Radarr";
  const ts = n.receivedAt.toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
  return `[Webhook — ${service}] ${n.message} (received ${ts})`;
}

async function notifyRequester(
  requester: MediaRequester,
  media: MediaNotificationInfo,
  source: "sonarr" | "radarr",
): Promise<void> {
  const slack = getSlackClient();
  const externalId = `${requester.channel}:${requester.threadTs}`;

  // Load conversation history
  const conv = await db.query.conversations.findFirst({
    where: (c, { and, eq: e }) =>
      and(e(c.externalId, externalId), e(c.interfaceType, "slack")),
  });

  let previousMessages: AgentMessage[] = [];
  let conversationId: string | undefined;

  if (conv) {
    conversationId = conv.id;
    const rows = await db.query.messages.findMany({
      where: eq(messages.conversationId, conv.id),
      orderBy: [asc(messages.sequence)],
    });

    const baseMessages = rows
      .filter((r) => !((r.data as AgentMessage).role === "assistant" && ((r.data as AgentMessage) as AssistantMessage).stopReason === "error"))
      .map((r) => ({ msg: r.data as AgentMessage, createdAt: r.createdAt }));

    // Interleave existing webhook notifications by time
    const existingNotifications = await getWebhookNotifications(conv.id);
    const webhookMessages = existingNotifications.map((n) => ({
      msg: { role: "user", content: formatWebhookForContext(n) } as AgentMessage,
      createdAt: n.receivedAt,
    }));

    previousMessages = [...baseMessages, ...webhookMessages]
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((x) => x.msg);
  }

  const prompt = formatWebhookPrompt(media, source);

  log.info("running agent for webhook notification", {
    channel: requester.channel,
    threadTs: requester.threadTs,
    title: media.title,
    historyLength: previousMessages.length,
  });

  const result = await runAgent(prompt, previousMessages);

  // Save new agent messages to DB
  if (conversationId) {
    const newMsgs = result.messages.slice(previousMessages.length);
    if (newMsgs.length > 0) {
      await db.insert(messages).values(
        newMsgs.map((m) => ({ conversationId: conversationId!, role: m.role, data: m })),
      );
    }
  }

  // Post to Slack
  await slack.chat.postMessage({
    channel: requester.channel,
    thread_ts: requester.threadTs,
    text: result.responseText,
  });

  // Save webhook notification with the actual response text
  saveWebhookNotification(requester.channel, requester.threadTs, source, result.responseText, media);

  log.info("notified requester", {
    channel: requester.channel,
    threadTs: requester.threadTs,
    title: media.title,
  });
}

async function notifyRequesters(
  requesters: MediaRequester[],
  media: MediaNotificationInfo,
): Promise<void> {
  if (requesters.length === 0) {
    log.info("no requesters to notify", { title: media.title });
    return;
  }

  // Deduplicate by channel:threadTs
  const seen = new Set<string>();
  const unique = requesters.filter((r) => {
    const key = `${r.channel}:${r.threadTs}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const source: "sonarr" | "radarr" = media.mediaType === "movie" ? "radarr" : "sonarr";

  const results = await Promise.allSettled(
    unique.map((r) => notifyRequester(r, media, source)),
  );

  for (let i = 0; i < results.length; i++) {
    if (results[i]!.status === "rejected") {
      const requester = unique[i]!;
      log.error("failed to notify requester", {
        channel: requester.channel,
        threadTs: requester.threadTs,
        error: results[i]!.status === "rejected"
          ? (results[i] as PromiseRejectedResult).reason instanceof Error
            ? (results[i] as PromiseRejectedResult).reason.message
            : String((results[i] as PromiseRejectedResult).reason)
          : "unknown",
      });
    }
  }
}

export async function handleRadarrWebhook(req: Request): Promise<Response> {
  let payload: RadarrWebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  log.info("radarr webhook received", {
    eventType: payload.eventType,
    movie: payload.movie?.title,
  });

  if (payload.eventType !== "Download") {
    return Response.json({ ok: true, skipped: true });
  }

  const requesters = await findMediaRequesters("movie", {
    radarr: payload.movie.id,
    tmdb: payload.movie.tmdbId,
  });

  const media: MediaNotificationInfo = {
    mediaType: "movie",
    title: payload.movie.title,
    year: payload.movie.year,
    quality: payload.release?.quality,
    releaseGroup: payload.release?.releaseGroup,
  };

  // Fire-and-forget
  notifyRequesters(requesters, media).catch((error) => {
    log.error("radarr notification failed", {
      title: payload.movie.title,
      error: error instanceof Error ? error.message : String(error),
    });
  });

  return Response.json({ ok: true, requesters: requesters.length });
}

export async function handleSonarrWebhook(req: Request): Promise<Response> {
  let payload: SonarrWebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  log.info("sonarr webhook received", {
    eventType: payload.eventType,
    series: payload.series?.title,
    episodeCount: payload.episodes?.length,
  });

  if (payload.eventType !== "Download") {
    return Response.json({ ok: true, skipped: true });
  }

  const key = `series:${payload.series.id}`;
  const newEpisodes = payload.episodes?.map((e) => ({
    seasonNumber: e.seasonNumber,
    episodeNumber: e.episodeNumber,
    title: e.title,
  })) ?? [];

  // If a batch is already pending for this series, accumulate into it
  const existing = pendingBatches.get(key);
  if (existing) {
    for (const ep of newEpisodes) {
      const dup = existing.media.episodes?.some(
        (e) => e.seasonNumber === ep.seasonNumber && e.episodeNumber === ep.episodeNumber,
      );
      if (!dup) existing.media.episodes?.push(ep);
    }
    log.info("batching episode", {
      title: payload.series.title,
      episode: newEpisodes.map((e) => `S${e.seasonNumber}E${e.episodeNumber}`).join(", "),
      batchSize: existing.media.episodes?.length,
    });
    return Response.json({ ok: true, batched: true });
  }

  // No pending batch — look up requesters
  const requesters = await findMediaRequesters("series", {
    sonarr: payload.series.id,
    tvdb: payload.series.tvdbId,
  });

  if (requesters.length === 0) {
    log.info("no requesters to notify", { title: payload.series.title });
    return Response.json({ ok: true, requesters: 0 });
  }

  const media: MediaNotificationInfo = {
    mediaType: "series",
    title: payload.series.title,
    year: payload.series.year,
    quality: payload.release?.quality,
    releaseGroup: payload.release?.releaseGroup,
    episodes: newEpisodes,
  };

  const timer = setTimeout(() => flushBatch(key), BATCH_DELAY_MS);
  pendingBatches.set(key, { media, requesters, timer });
  log.info("batch started", {
    title: payload.series.title,
    episode: newEpisodes.map((e) => `S${e.seasonNumber}E${e.episodeNumber}`).join(", "),
    requesters: requesters.length,
    delayMs: BATCH_DELAY_MS,
  });

  return Response.json({ ok: true, batched: true, requesters: requesters.length });
}
