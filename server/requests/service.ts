import type { RadarrMovie } from "#server/radarr/types.ts";
import type { SonarrEpisode, SonarrSeries } from "#server/sonarr/types.ts";
import * as radarr from "#server/radarr/api.ts";
import * as sonarr from "#server/sonarr/api.ts";
import type { MonitorOption } from "#server/sonarr/api.ts";
import { deleteSeasonRequests, saveMediaRequest } from "#server/db/requests.ts";
import { clearRemoval } from "#server/db/removals.ts";
import {
  deactivateSeasonSubscriptions,
  upsertMovieSubscription,
  upsertSeriesSubscription,
} from "#server/db/subscriptions.ts";
import { invalidateLibraryIndex } from "./library.ts";
import { discardStalled } from "./retry.ts";
import { createLogger } from "#server/logger.ts";
import { withDatabaseLock } from "#server/db/lock.ts";
import { ApiError } from "#server/http/client.ts";

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
  /** Absent is the series as a whole. */
  seasonNumber?: number;
  /** Narrows the subscription only; ownership is never finer than a season. */
  episodeNumber?: number;
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
      seasonNumber: input.seasonNumber,
    });
  }

  const { userId, conversationId } = requester;
  if (mediaType === "movie") {
    await upsertMovieSubscription(userId, serviceId, conversationId ?? null);
  } else {
    await upsertSeriesSubscription(
      userId,
      serviceId,
      conversationId ?? null,
      input.seasonNumber,
      input.episodeNumber,
    );
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
  return withDatabaseLock(`media:movie:${input.tmdbId}`, async () => {
    let movie = await radarr.getLibraryMovieByTmdbId(input.tmdbId);
    let status: RequestStatus = "existing";
    if (!movie) {
      try {
        movie = await addToRadarr(input.tmdbId);
        status = "added";
      } catch (error) {
        if (!(error instanceof ApiError) || ![400, 409].includes(error.status)) throw error;
        movie = await radarr.getLibraryMovieByTmdbId(input.tmdbId);
        if (!movie) throw error;
        invalidateLibraryIndex();
      }
    }

    // It is back, so how it once left stops being the answer to where it is.
    if (status === "added") {
      invalidateLibraryIndex();
      await clearRemoval("movie", input.tmdbId);
    }

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
  });
}

/** How a caller names a series: Sonarr is TVDB-native but resolves TMDB itself. */
export interface SeriesRef {
  tmdbId?: number;
  tvdbId?: number;
}

async function withRequestedSeriesLock<T>(ref: SeriesRef, run: () => Promise<T>): Promise<T> {
  let tvdbId = ref.tvdbId;
  if (ref.tmdbId !== undefined) {
    const [lookup] = await sonarr.searchSeries(seriesTerm(ref));
    tvdbId = lookup?.tvdbId;
  }
  if (!tvdbId) throw new MediaNotFoundError("series", seriesTerm(ref));
  return withDatabaseLock(`media:series:${tvdbId}`, run);
}

function seriesTerm(ref: SeriesRef): string {
  if (ref.tmdbId !== undefined) return `tmdb:${ref.tmdbId}`;
  if (ref.tvdbId !== undefined) return `tvdb:${ref.tvdbId}`;
  throw new MediaNotFoundError("series", "no TMDB or TVDB id");
}

/**
 * The series in Sonarr, added with the given monitoring if it is not there yet.
 * Sonarr's lookup reports its own id for a series it already holds, so one call
 * answers both what the series is and whether it is there.
 */
async function findOrAddSeries(
  ref: SeriesRef,
  monitorOption: MonitorOption,
): Promise<{ status: RequestStatus; series: SonarrSeries }> {
  const term = seriesTerm(ref);
  const [lookup] = await sonarr.searchSeries(term);
  if (!lookup?.tvdbId) throw new MediaNotFoundError("series", term);

  if (lookup.id) return { status: "existing", series: await sonarr.getSeries(lookup.id) };

  let series: SonarrSeries;
  try {
    series = await sonarr.addSeries(lookup.title, lookup.year, lookup.tvdbId, monitorOption);
  } catch (error) {
    if (!(error instanceof ApiError) || ![400, 409].includes(error.status)) throw error;
    const [held] = await sonarr.searchSeries(`tvdb:${lookup.tvdbId}`);
    if (!held?.id) throw error;
    invalidateLibraryIndex();
    return { status: "existing", series: await sonarr.getSeries(held.id) };
  }
  invalidateLibraryIndex();

  // It is back, so how it once left stops being the answer to where it is.
  const tmdbId = series.tmdbId ?? ref.tmdbId;
  if (tmdbId !== undefined) await clearRemoval("series", tmdbId);

  return { status: "added", series };
}

/**
 * Add a series to the library and record who asked for it. A series already
 * there is left as it is — asking for more of it is asking for a season.
 */
export async function requestSeries(input: {
  tmdbId?: number;
  tvdbId?: number;
  monitorOption?: MonitorOption;
  requestedBy?: Requester;
  posterPath?: string;
}): Promise<{ status: RequestStatus; series: SonarrSeries }> {
  return withRequestedSeriesLock(input, async () => {
    const { status, series } = await findOrAddSeries(input, input.monitorOption ?? "all");

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
      term: seriesTerm(input),
      title: series.title,
      serviceId: series.id,
      userId: input.requestedBy?.userId,
    });
    return { status, series };
  });
}

function seasonOf(series: SonarrSeries, seasonNumber: number) {
  const season = series.seasons?.find((candidate) => candidate.seasonNumber === seasonNumber);
  if (!season) throw new MediaNotFoundError("series", `${series.title} season ${seasonNumber}`);
  return season;
}

/** Monitoring the episodes too, since Sonarr searches for the monitored ones. */
async function monitorSeason(series: SonarrSeries, seasonNumber: number): Promise<boolean> {
  const season = seasonOf(series, seasonNumber);
  const wasMonitored = season.monitored;

  if (!wasMonitored) {
    season.monitored = true;
    await sonarr.updateSeries(series.id, series);
  }

  const episodes = await sonarr.getEpisodes(series.id);
  const unmonitored = episodes
    .filter((episode) => episode.seasonNumber === seasonNumber && !episode.monitored)
    .map((episode) => episode.id);
  if (unmonitored.length > 0) await sonarr.monitorEpisodes(unmonitored, true);

  return !wasMonitored || unmonitored.length > 0;
}

/**
 * Ask for one season: the unit people actually want, and the unit ownership is
 * kept in. The series is added unmonitored when it is missing, so nothing but
 * the asked-for season is ever pulled in by adding it.
 */
export async function requestSeason(input: {
  tmdbId?: number;
  tvdbId?: number;
  seasonNumber: number;
  requestedBy?: Requester;
  posterPath?: string;
}): Promise<{ status: RequestStatus; series: SonarrSeries; seasonNumber: number }> {
  return withRequestedSeriesLock(input, async () => {
    const { seasonNumber } = input;
    const { status: seriesStatus, series } = await findOrAddSeries(input, "none");

    const monitoringChanged = await monitorSeason(series, seasonNumber);
    // Asking again for a season half-stuck in the queue means the stuck release
    // has to go, or the search finds the same one and nothing moves.
    await discardStalled("series", series.id, seasonNumber);
    await sonarr.searchEpisodes(series.id, undefined, seasonNumber);
    if (monitoringChanged) invalidateLibraryIndex();

    if (input.requestedBy) {
      await recordRequest({
        requester: input.requestedBy,
        mediaType: "series",
        tmdbId: series.tmdbId ?? input.tmdbId,
        serviceId: series.id,
        title: series.title,
        year: series.year || undefined,
        posterPath: input.posterPath,
        seasonNumber,
      });
    }

    const status: RequestStatus =
      seriesStatus === "added" || monitoringChanged ? "added" : "existing";
    log.info("season requested", {
      status,
      term: seriesTerm(input),
      title: series.title,
      serviceId: series.id,
      seasonNumber,
      userId: input.requestedBy?.userId,
    });
    return { status, series, seasonNumber };
  });
}

function episodeOf(
  episodes: SonarrEpisode[],
  seasonNumber: number,
  episodeNumber: number,
  series: SonarrSeries,
): SonarrEpisode {
  const episode = episodes.find(
    (candidate) =>
      candidate.seasonNumber === seasonNumber && candidate.episodeNumber === episodeNumber,
  );
  if (!episode) {
    throw new MediaNotFoundError("series", `${series.title} S${seasonNumber}E${episodeNumber}`);
  }
  return episode;
}

/**
 * The one episode that never came in. Ownership stays at the season, since a
 * single episode is not a thing anyone keeps or releases.
 */
export async function requestEpisode(input: {
  tmdbId?: number;
  tvdbId?: number;
  seasonNumber: number;
  episodeNumber: number;
  requestedBy?: Requester;
  posterPath?: string;
}): Promise<{ status: RequestStatus; series: SonarrSeries }> {
  return withRequestedSeriesLock(input, async () => {
    const { seasonNumber, episodeNumber } = input;
    const { status, series } = await findOrAddSeries(input, "none");

    const episodes = await sonarr.getEpisodes(series.id);
    const episode = episodeOf(episodes, seasonNumber, episodeNumber, series);

    await sonarr.monitorEpisodes([episode.id], true);
    await sonarr.searchEpisodes(undefined, [episode.id]);

    if (input.requestedBy) {
      await recordRequest({
        requester: input.requestedBy,
        mediaType: "series",
        tmdbId: series.tmdbId ?? input.tmdbId,
        serviceId: series.id,
        title: series.title,
        year: series.year || undefined,
        posterPath: input.posterPath,
        seasonNumber,
        episodeNumber,
      });
    }

    log.info("episode requested", {
      title: series.title,
      serviceId: series.id,
      seasonNumber,
      episodeNumber,
      userId: input.requestedBy?.userId,
    });
    return { status, series };
  });
}

/**
 * Give a season back: its files go, its monitoring goes, and nobody owns it
 * any more. The series stays, so the seasons still wanted are untouched and
 * the season can be asked for again.
 */
export async function releaseSeason(
  seriesId: number,
  seasonNumber: number,
): Promise<{ series: SonarrSeries; filesDeleted: number }> {
  const { tvdbId } = await sonarr.getSeries(seriesId);
  return withDatabaseLock(`media:series:${tvdbId}`, async () => {
    const [series, episodes] = await Promise.all([
      sonarr.getSeries(seriesId),
      sonarr.getEpisodes(seriesId),
    ]);

    const season = seasonOf(series, seasonNumber);
    const fileIds = new Set(
      episodes
        .filter((episode) => episode.seasonNumber === seasonNumber && episode.episodeFileId)
        .map((episode) => episode.episodeFileId!),
    );

    for (const fileId of fileIds) {
      await sonarr.deleteEpisodeFile(fileId);
    }

    season.monitored = false;
    await sonarr.updateSeries(seriesId, series);
    invalidateLibraryIndex();

    if (series.tmdbId !== undefined) await deleteSeasonRequests(series.tmdbId, seasonNumber);
    await deactivateSeasonSubscriptions(seriesId, seasonNumber);

    log.info("season released", {
      title: series.title,
      serviceId: seriesId,
      seasonNumber,
      filesDeleted: fileIds.size,
    });
    return { series, filesDeleted: fileIds.size };
  });
}
