import { createLogger } from "../logger.ts";
import { errorMessage } from "../errors.ts";
import { checkWebhookAuth } from "./auth.ts";
import { batchSeriesNotification } from "./batch.ts";
import { notifyRequesters } from "./notify.ts";
import { findMediaRequesters } from "./requester.ts";
import type { MediaNotificationInfo, RadarrWebhookPayload, SonarrWebhookPayload } from "./types.ts";

const log = createLogger("webhooks");

/** Reads an authenticated Download webhook, or the response explaining why not. */
async function readDownloadPayload<T extends { eventType: string }>(
  req: Request,
): Promise<{ payload: T } | { response: Response }> {
  const authError = checkWebhookAuth(req);
  if (authError) return { response: authError };

  let payload: T;
  try {
    payload = (await req.json()) as T;
  } catch {
    return { response: Response.json({ error: "Invalid JSON" }, { status: 400 }) };
  }

  if (payload.eventType !== "Download") {
    return { response: Response.json({ ok: true, skipped: true }) };
  }
  return { payload };
}

export async function handleRadarrWebhook(req: Request): Promise<Response> {
  const result = await readDownloadPayload<RadarrWebhookPayload>(req);
  if ("response" in result) return result.response;
  const { payload } = result;

  log.info("radarr webhook received", { movie: payload.movie?.title });

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

  // Radarr does not wait for a reply, so notify in the background.
  notifyRequesters(requesters, media).catch((error) => {
    log.error("radarr notification failed", {
      title: payload.movie.title,
      error: errorMessage(error),
    });
  });

  return Response.json({ ok: true, requesters: requesters.length });
}

export async function handleSonarrWebhook(req: Request): Promise<Response> {
  const result = await readDownloadPayload<SonarrWebhookPayload>(req);
  if ("response" in result) return result.response;
  const { payload } = result;

  log.info("sonarr webhook received", {
    series: payload.series?.title,
    episodeCount: payload.episodes?.length,
  });

  batchSeriesNotification(payload.series.id, {
    mediaType: "series",
    title: payload.series.title,
    year: payload.series.year,
    quality: payload.release?.quality,
    releaseGroup: payload.release?.releaseGroup,
    episodes:
      payload.episodes?.map((e) => ({
        seasonNumber: e.seasonNumber,
        episodeNumber: e.episodeNumber,
        title: e.title,
      })) ?? [],
  });

  return Response.json({ ok: true, batched: true });
}
