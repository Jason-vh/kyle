import { createLogger } from "#server/logger.ts";
import { isInteger, isObject, isText, readJsonObject } from "#server/http/input.ts";
import { checkWebhookAuth } from "./auth.ts";
import { enqueueWebhook } from "./jobs.ts";
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
    payload = (await readJsonObject(req)) as T;
  } catch {
    return { response: Response.json({ error: "Invalid JSON" }, { status: 400 }) };
  }

  if (!isText(payload.eventType)) {
    return { response: Response.json({ error: "Invalid eventType" }, { status: 400 }) };
  }
  if (payload.eventType !== "Download") {
    return { response: Response.json({ ok: true, skipped: true }) };
  }
  return { payload };
}

function validMedia(value: unknown): boolean {
  return isObject(value) && isInteger(value.id, 1) && isText(value.title) && isInteger(value.year);
}

function validRelease(value: unknown): boolean {
  if (value === undefined) return true;
  return (
    isObject(value) &&
    (value.quality === undefined || typeof value.quality === "string") &&
    (value.releaseGroup === undefined || typeof value.releaseGroup === "string")
  );
}

export async function handleRadarrWebhook(req: Request): Promise<Response> {
  const result = await readDownloadPayload<RadarrWebhookPayload>(req);
  if ("response" in result) return result.response;
  const { payload } = result;

  if (
    !validMedia(payload.movie) ||
    !isInteger(payload.movie?.tmdbId, 1) ||
    !validRelease(payload.release)
  ) {
    return Response.json({ error: "Invalid movie download" }, { status: 400 });
  }

  log.info("radarr webhook received", { movie: payload.movie.title });

  const media: MediaNotificationInfo = {
    mediaType: "movie",
    title: payload.movie.title,
    year: payload.movie.year,
    quality: payload.release?.quality,
    releaseGroup: payload.release?.releaseGroup,
  };

  await enqueueWebhook({ radarr: payload.movie.id, tmdb: payload.movie.tmdbId }, media);

  return Response.json({ ok: true });
}

export async function handleSonarrWebhook(req: Request): Promise<Response> {
  const result = await readDownloadPayload<SonarrWebhookPayload>(req);
  if ("response" in result) return result.response;
  const { payload } = result;

  if (
    !validMedia(payload.series) ||
    !validRelease(payload.release) ||
    !Array.isArray(payload.episodes) ||
    !payload.episodes.every(
      (episode) =>
        isObject(episode) &&
        isInteger(episode.seasonNumber) &&
        isInteger(episode.episodeNumber, 1) &&
        typeof episode.title === "string",
    )
  ) {
    return Response.json({ error: "Invalid series download" }, { status: 400 });
  }

  log.info("sonarr webhook received", {
    series: payload.series?.title,
    episodeCount: payload.episodes?.length,
  });

  await enqueueWebhook(
    { sonarr: payload.series.id },
    {
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
    },
  );

  return Response.json({ ok: true, batched: true });
}
