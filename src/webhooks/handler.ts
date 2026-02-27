import { createLogger } from "../logger.ts";
import { getSlackClient } from "../slack/client.ts";
import { findMediaRequesters } from "./requester.ts";
import { generateNotificationMessage } from "./notifications.ts";
import { saveWebhookNotification } from "../db/webhook-notifications.ts";
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

  const message = await generateNotificationMessage(media);
  const slack = getSlackClient();

  const source = media.mediaType === "movie" ? "radarr" : "sonarr";

  const results = await Promise.allSettled(
    unique.map((r) =>
      slack.chat.postMessage({
        channel: r.channel,
        thread_ts: r.threadTs,
        text: message,
      })
    ),
  );

  for (let i = 0; i < results.length; i++) {
    const result = results[i]!;
    const requester = unique[i]!;
    if (result.status === "rejected") {
      log.error("failed to notify requester", {
        channel: requester.channel,
        threadTs: requester.threadTs,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    } else {
      log.info("notified requester", {
        channel: requester.channel,
        threadTs: requester.threadTs,
        title: media.title,
      });
      saveWebhookNotification(requester.channel, requester.threadTs, source, message, media);
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

  // Fire-and-forget: don't block the webhook response
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
