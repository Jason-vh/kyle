import { MessageFlags } from "discord.js";
import { timingSafeEqual } from "crypto";
import { createLogger } from "../logger.ts";
import { getSlackClient } from "../slack/client.ts";
import { getDiscordClient } from "../discord/client.ts";
import { db } from "../db/index.ts";
import { messages } from "../db/schema.ts";
import { findMediaRequesters } from "./requester.ts";
import { saveWebhookNotification } from "../db/webhook-notifications.ts";
import { loadConversationHistory } from "../db/conversation-history.ts";
import { runAgent, type AgentContext } from "../agent/index.ts";
import type {
  RadarrWebhookPayload,
  SonarrWebhookPayload,
  MediaNotificationInfo,
  MediaRequester,
} from "./types.ts";

const log = createLogger("webhooks");

function checkWebhookAuth(req: Request): Response | null {
  const webhookAuth = process.env.WEBHOOK_AUTH;
  if (!webhookAuth) {
    return null; // No auth configured, allow through for backwards compat
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Basic ")) {
    log.warn("webhook request missing basic auth");
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const decoded = Buffer.from(authHeader.slice(6), "base64").toString("utf-8");
  const expected = Buffer.from(webhookAuth);
  const actual = Buffer.from(decoded);

  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    log.warn("webhook request invalid credentials");
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null; // Auth valid
}

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
      .map(
        (e) =>
          `S${String(e.seasonNumber).padStart(2, "0")}E${String(e.episodeNumber).padStart(2, "0")} "${e.title}"`,
      )
      .join(", ");
    desc += ` — ${eps}`;
  }

  if (media.quality) {
    desc += ` (${media.quality}${media.releaseGroup ? ` · ${media.releaseGroup}` : ""})`;
  }

  return `[Webhook — ${service}] ${desc} has finished downloading. Let the user know it's ready.`;
}

async function notifyRequester(
  requester: MediaRequester,
  media: MediaNotificationInfo,
  source: "sonarr" | "radarr",
): Promise<void> {
  const { conversationId } = requester;

  // Load conversation history
  const previousMessages = await loadConversationHistory(conversationId);

  const prompt = formatWebhookPrompt(media, source);

  // Save webhook notification before running agent so its receivedAt timestamp
  // is earlier than the assistant response messages' createdAt.
  let desc = `${media.title} (${media.year}) has finished downloading.`;
  if (media.mediaType === "series" && media.episodes?.length) {
    const eps = media.episodes
      .map(
        (e) =>
          `S${String(e.seasonNumber).padStart(2, "0")}E${String(e.episodeNumber).padStart(2, "0")} "${e.title}"`,
      )
      .join(", ");
    desc = `${media.title} (${media.year}) — ${eps} finished downloading.`;
  }
  saveWebhookNotification(conversationId, source, desc, media);

  const agentContext: AgentContext = { interfaceType: requester.interfaceType };

  log.info("running agent for webhook notification", {
    conversationId,
    interfaceType: requester.interfaceType,
    title: media.title,
    historyLength: previousMessages.length,
  });

  const result = await runAgent(prompt, previousMessages, agentContext);

  // Save new agent messages to DB
  const newMsgs = result.messages.slice(previousMessages.length).filter((m) => m.role !== "user");
  if (newMsgs.length > 0) {
    await db
      .insert(messages)
      .values(newMsgs.map((m) => ({ conversationId, role: m.role, data: m })));
  }

  // Post to the correct platform
  if (requester.interfaceType === "slack") {
    const slack = getSlackClient();
    await slack.chat.postMessage({
      channel: requester.channel,
      thread_ts: requester.threadTs,
      text: result.responseText,
      unfurl_links: false,
      unfurl_media: false,
    });
    log.info("notified requester via slack", {
      channel: requester.channel,
      threadTs: requester.threadTs,
      title: media.title,
    });
  } else if (requester.interfaceType === "discord") {
    const discord = getDiscordClient();
    if (!discord) {
      log.warn("discord client not available for webhook notification", {
        channelId: requester.channelId,
      });
      return;
    }
    const channel = await discord.channels.fetch(requester.channelId);
    if (channel && "send" in channel) {
      let responseText = result.responseText;
      if (responseText.length > 2000) {
        responseText = responseText.slice(0, 1997) + "...";
      }
      await channel.send({ content: responseText, flags: MessageFlags.SuppressEmbeds });
    }
    log.info("notified requester via discord", {
      channelId: requester.channelId,
      title: media.title,
    });
  }
}

async function notifyRequesters(
  requesters: MediaRequester[],
  media: MediaNotificationInfo,
): Promise<void> {
  if (requesters.length === 0) {
    log.info("no requesters to notify", { title: media.title });
    return;
  }

  // Deduplicate by conversationId
  const seen = new Set<string>();
  const unique = requesters.filter((r) => {
    if (seen.has(r.conversationId)) return false;
    seen.add(r.conversationId);
    return true;
  });

  const source: "sonarr" | "radarr" = media.mediaType === "movie" ? "radarr" : "sonarr";

  const results = await Promise.allSettled(unique.map((r) => notifyRequester(r, media, source)));

  for (let i = 0; i < results.length; i++) {
    if (results[i]!.status === "rejected") {
      const requester = unique[i]!;
      log.error("failed to notify requester", {
        conversationId: requester.conversationId,
        interfaceType: requester.interfaceType,
        error:
          results[i]!.status === "rejected"
            ? (results[i] as PromiseRejectedResult).reason instanceof Error
              ? (results[i] as PromiseRejectedResult).reason.message
              : String((results[i] as PromiseRejectedResult).reason)
            : "unknown",
      });
    }
  }
}

export async function handleRadarrWebhook(req: Request): Promise<Response> {
  const authError = checkWebhookAuth(req);
  if (authError) return authError;

  let payload: RadarrWebhookPayload;
  try {
    payload = (await req.json()) as RadarrWebhookPayload;
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
  const authError = checkWebhookAuth(req);
  if (authError) return authError;

  let payload: SonarrWebhookPayload;
  try {
    payload = (await req.json()) as SonarrWebhookPayload;
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
  const newEpisodes =
    payload.episodes?.map((e) => ({
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
