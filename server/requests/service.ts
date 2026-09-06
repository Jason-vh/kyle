import type { RadarrMovie } from "#server/radarr/types.ts";
import type { SonarrSeries } from "#server/sonarr/types.ts";
import * as radarr from "#server/radarr/api.ts";
import * as sonarr from "#server/sonarr/api.ts";
import type { MonitorOption } from "#server/sonarr/api.ts";
import { saveMediaRequest } from "#server/db/requests.ts";
import { upsertMovieSubscription, upsertSeriesSubscription } from "#server/db/subscriptions.ts";
import { invalidateLibraryIndex } from "./library.ts";
import { createLogger } from "#server/logger.ts";

const log = createLogger("requests");

export type RequestableMediaType = "movie" | "series";

/** `existing` means it was already in the library, so nothing was added. */
export type RequestStatus = "added" | "existing";

export class MediaNotFoundError extends Error {
  constructor(mediaType: RequestableMediaType, ref: string | number) {
    super(`No ${mediaType} found for ${ref}`);
    this.name = "MediaNotFoundError";
  }
}

/** Who asked for a title, and where to answer them; a browser request has no conversation. */
export interface Requester {
  userId: string;
  conversationId?: string;
}

interface RecordInput {
  requester: Requester;
  mediaType: RequestableMediaType;
  /** Absent for a series the services cannot map to TMDB. */
  tmdbId?: number;
  serviceId: number;
  title: string;
  year?: number;
  posterPath?: string;
}

/**
 * The one record of a request: what was asked for, and who to notify when it
 * lands. Every add goes through here, whichever interface it came from.
 */
async function recordRequest(input: RecordInput): Promise<void> {
  const { requester, mediaType, tmdbId, serviceId } = input;

  if (tmdbId === undefined) {
    log.warn("no TMDB id to record the request against", {
      mediaType,
      serviceId,
      title: input.title,
    });
  } else {
    await saveMediaRequest({
      userId: requester.userId,
      mediaType,
      tmdbId,
      title: input.title,
      year: input.year,
      posterPath: input.posterPath,
      serviceId,
    });
  }

  const { userId, conversationId } = requester;
  if (mediaType === "movie") {
    await upsertMovieSubscription(userId, serviceId, conversationId ?? null);
  } else {
    await upsertSeriesSubscription(userId, serviceId, conversationId ?? null);
  }
}

async function addToRadarr(tmdbId: number): Promise<RadarrMovie> {
  const lookup = await radarr.lookupMovieByTmdbId(tmdbId);
  if (!lookup?.title) throw new MediaNotFoundError("movie", tmdbId);
  return radarr.addMovie(lookup.title, lookup.year, tmdbId);
}

/**
 * Add a movie to the library and record who asked for it. Requesting something
 * already there records the request without touching Radarr.
 */
export async function requestMovie(input: {
  tmdbId: number;
  requestedBy?: Requester;
  posterPath?: string;
}): Promise<{ status: RequestStatus; movie: RadarrMovie }> {
  // Radarr rejects a movie it already holds, and its lookup will not say so.
  const held = await radarr.getLibraryMovieByTmdbId(input.tmdbId);
  const movie = held ?? (await addToRadarr(input.tmdbId));
  const status: RequestStatus = held ? "existing" : "added";

  if (status === "added") invalidateLibraryIndex();

  if (input.requestedBy) {
    await recordRequest({
      requester: input.requestedBy,
      mediaType: "movie",
      tmdbId: input.tmdbId,
      serviceId: movie.id,
      title: movie.title,
      // Radarr reports 0 for a film with no known release year.
      year: movie.year || undefined,
      posterPath: input.posterPath,
    });
  }

  log.info("movie requested", {
    status,
    tmdbId: input.tmdbId,
    title: movie.title,
    serviceId: movie.id,
    userId: input.requestedBy?.userId,
  });
  return { status, movie };
}

/**
 * Add a series to the library and record who asked for it. Sonarr is TVDB-native
 * but resolves a TMDB id itself, so either identifies the series.
 */
export async function requestSeries(input: {
  tmdbId?: number;
  tvdbId?: number;
  monitorOption?: MonitorOption;
  requestedBy?: Requester;
  posterPath?: string;
}): Promise<{ status: RequestStatus; series: SonarrSeries }> {
  if (input.tmdbId === undefined && input.tvdbId === undefined) {
    throw new MediaNotFoundError("series", "no TMDB or TVDB id");
  }
  const term = input.tmdbId !== undefined ? `tmdb:${input.tmdbId}` : `tvdb:${input.tvdbId}`;

  // Sonarr's lookup reports its own id for a series it already holds, so one
  // call answers both what the series is and whether it is there.
  const [lookup] = await sonarr.searchSeries(term);
  if (!lookup?.tvdbId) throw new MediaNotFoundError("series", term);

  const status: RequestStatus = lookup.id ? "existing" : "added";
  const series = lookup.id
    ? await sonarr.getSeries(lookup.id)
    : await sonarr.addSeries(
        lookup.title,
        lookup.year,
        lookup.tvdbId,
        input.monitorOption ?? "all",
      );

  if (status === "added") invalidateLibraryIndex();

  if (input.requestedBy) {
    await recordRequest({
      requester: input.requestedBy,
      mediaType: "series",
      tmdbId: series.tmdbId ?? input.tmdbId,
      serviceId: series.id,
      title: series.title,
      year: series.year || undefined,
      posterPath: input.posterPath,
    });
  }

  log.info("series requested", {
    status,
    term,
    title: series.title,
    serviceId: series.id,
    userId: input.requestedBy?.userId,
  });
  return { status, series };
}
