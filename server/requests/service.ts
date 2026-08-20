import * as radarr from "../radarr/api.ts";
import * as sonarr from "../sonarr/api.ts";
import { saveMediaRequest } from "../db/requests.ts";
import { createLogger } from "../logger.ts";

const log = createLogger("requests");

export type RequestableMediaType = "movie" | "series";

export class MediaNotFoundError extends Error {
  constructor(mediaType: string, tmdbId: number) {
    super(`No ${mediaType} found for TMDB id ${tmdbId}`);
    this.name = "MediaNotFoundError";
  }
}

export interface RequestOutcome {
  /** `existing` means it was already in the library, so nothing was added. */
  status: "added" | "existing";
  mediaType: RequestableMediaType;
  tmdbId: number;
  title: string;
  year?: number;
  serviceId: number;
}

async function addMovie(tmdbId: number): Promise<Omit<RequestOutcome, "mediaType" | "tmdbId">> {
  // Radarr rejects a movie it already holds, and its lookup will not say so.
  const existing = await radarr.getLibraryMovieByTmdbId(tmdbId);
  if (existing) {
    return {
      status: "existing",
      title: existing.title,
      year: existing.year,
      serviceId: existing.id,
    };
  }

  const lookup = await radarr.lookupMovieByTmdbId(tmdbId);
  if (!lookup?.title) throw new MediaNotFoundError("movie", tmdbId);

  const added = await radarr.addMovie(lookup.title, lookup.year, tmdbId);
  return { status: "added", title: added.title, year: added.year, serviceId: added.id };
}

async function addSeries(tmdbId: number): Promise<Omit<RequestOutcome, "mediaType" | "tmdbId">> {
  // Sonarr resolves a TMDB id itself, and reports its own id for a series it
  // already holds, so one lookup answers both questions.
  const [lookup] = await sonarr.searchSeries(`tmdb:${tmdbId}`);
  if (!lookup?.tvdbId) throw new MediaNotFoundError("series", tmdbId);

  if (lookup.id) {
    return { status: "existing", title: lookup.title, year: lookup.year, serviceId: lookup.id };
  }

  const added = await sonarr.addSeries(lookup.title, lookup.year, lookup.tvdbId, "all");
  return { status: "added", title: added.title, year: added.year, serviceId: added.id };
}

/**
 * Add a title to the library on a user's behalf and record who asked for it.
 * Requesting something already in the library records the request without
 * touching Radarr or Sonarr.
 */
export async function requestMedia(input: {
  userId: string;
  mediaType: RequestableMediaType;
  tmdbId: number;
  posterPath?: string;
}): Promise<RequestOutcome> {
  const { userId, mediaType, tmdbId } = input;

  const result = mediaType === "movie" ? await addMovie(tmdbId) : await addSeries(tmdbId);

  await saveMediaRequest({
    userId,
    mediaType,
    tmdbId,
    title: result.title,
    // Radarr reports 0 for a film with no known release year.
    year: result.year || undefined,
    posterPath: input.posterPath,
    serviceId: result.serviceId,
  });

  log.info("media requested", { userId, mediaType, tmdbId, ...result });
  return { ...result, mediaType, tmdbId };
}
