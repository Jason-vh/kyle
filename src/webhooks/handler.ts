import { createLogger } from "../logger.ts";
import { getSlackClient } from "../slack/client.ts";
import { findMediaRequesters } from "./requester.ts";
import { generateNotificationMessage } from "./notifications.ts";
import type {
  RadarrWebhookPayload,
  SonarrWebhookPayload,
  MediaNotificationInfo,
  MediaRequester,
} from "./types.ts";

const log = createLogger("webhooks");

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

  const requesters = await findMediaRequesters("series", {
    sonarr: payload.series.id,
    tvdb: payload.series.tvdbId,
  });

  const media: MediaNotificationInfo = {
    mediaType: "series",
    title: payload.series.title,
    year: payload.series.year,
    quality: payload.release?.quality,
    releaseGroup: payload.release?.releaseGroup,
    episodes: payload.episodes?.map((e) => ({
      seasonNumber: e.seasonNumber,
      episodeNumber: e.episodeNumber,
      title: e.title,
    })),
  };

  // Fire-and-forget: don't block the webhook response
  notifyRequesters(requesters, media).catch((error) => {
    log.error("sonarr notification failed", {
      title: payload.series.title,
      error: error instanceof Error ? error.message : String(error),
    });
  });

  return Response.json({ ok: true, requesters: requesters.length });
}
