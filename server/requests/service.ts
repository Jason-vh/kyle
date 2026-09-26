import type { RadarrMovie } from "#server/radarr/types.ts";
import type { SonarrEpisode, SonarrSeries } from "#server/sonarr/types.ts";
import * as radarr from "#server/radarr/api.ts";
import * as sonarr from "#server/sonarr/api.ts";
import { isContinuing, isFollowing } from "#server/sonarr/utils.ts";
import type { SeriesAddition } from "#server/sonarr/api.ts";
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

/** A request that would add a series and want nothing of it. */
export class NothingRequestedError extends Error {
  constructor() {
    super("Choose a season to download, or follow the series");
    this.name = "NothingRequestedError";
  }
}

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

/** Sonarr's own view of a series, which reports its id when it already holds it. */
async function lookupSeries(ref: SeriesRef): Promise<SonarrSeries> {
  const term = seriesTerm(ref);
  const [lookup] = await sonarr.searchSeries(term);
  if (!lookup?.tvdbId) throw new MediaNotFoundError("series", term);
  return lookup;
}

/** Every season but the specials, which nobody means by "the series". */
export function regularSeasons(series: SonarrSeries): number[] {
  return (series.seasons ?? [])
    .map((season) => season.seasonNumber)
    .filter((seasonNumber) => seasonNumber > 0);
}

function assertSeasons(series: SonarrSeries, seasonNumbers: number[]): void {
  for (const seasonNumber of seasonNumbers) seasonOf(series, seasonNumber);
}

/**
 * The series in Sonarr, added with the given seasons and following if it is
 * not there yet. What a held series should become is the caller's business.
 */
async function findOrAddSeries(
  ref: SeriesRef,
  lookup: SonarrSeries,
  addition: SeriesAddition,
): Promise<{ added: boolean; series: SonarrSeries }> {
  if (lookup.id) return { added: false, series: await sonarr.getSeries(lookup.id) };

  let series: SonarrSeries;
  try {
    series = await sonarr.addSeries(lookup, addition);
  } catch (error) {
    if (!(error instanceof ApiError) || ![400, 409].includes(error.status)) throw error;
    const [held] = await sonarr.searchSeries(`tvdb:${lookup.tvdbId}`);
    if (!held?.id) throw error;
    invalidateLibraryIndex();
    return { added: false, series: await sonarr.getSeries(held.id) };
  }
  invalidateLibraryIndex();

  // It is back, so how it once left stops being the answer to where it is.
  const tmdbId = series.tmdbId ?? ref.tmdbId;
  if (tmdbId !== undefined) await clearRemoval("series", tmdbId);

  return { added: true, series };
}

function seasonOf(series: SonarrSeries, seasonNumber: number) {
  const season = series.seasons?.find((candidate) => candidate.seasonNumber === seasonNumber);
  if (!season) throw new MediaNotFoundError("series", `${series.title} season ${seasonNumber}`);
  return season;
}

/** The episodes follow the season, since Sonarr searches for the monitored ones. */
async function monitorSeason(
  series: SonarrSeries,
  seasonNumber: number,
  monitored = true,
): Promise<boolean> {
  const season = seasonOf(series, seasonNumber);
  const seasonChanged = season.monitored !== monitored;

  if (seasonChanged) {
    season.monitored = monitored;
    await sonarr.updateSeries(series.id, series);
  }

  const episodes = await sonarr.getEpisodes(series.id);
  const out = episodes
    .filter((episode) => episode.seasonNumber === seasonNumber && episode.monitored !== monitored)
    .map((episode) => episode.id);
  if (out.length > 0) await sonarr.monitorEpisodes(out, monitored);

  return seasonChanged || out.length > 0;
}

/**
 * Stop looking for a season, or start again, leaving whatever is on disk where
 * it is. Starting does not search: asking for a season is what requesting is for.
 */
export async function setSeasonMonitored(
  seriesId: number,
  seasonNumber: number,
  monitored: boolean,
): Promise<{ changed: boolean }> {
  const { tvdbId } = await sonarr.getSeries(seriesId);
  return withDatabaseLock(`media:series:${tvdbId}`, async () => {
    const series = await sonarr.getSeries(seriesId);
    const changed = await monitorSeason(series, seasonNumber, monitored);
    if (changed) invalidateLibraryIndex();

    log.info("season monitoring set", {
      title: series.title,
      serviceId: seriesId,
      seasonNumber,
      monitored,
      changed,
    });
    return { changed };
  });
}

/**
 * Seasons of a series Sonarr already holds, monitored and searched for. Says
 * whether any of them was not wanted before.
 */
async function wantSeasons(series: SonarrSeries, seasonNumbers: number[]): Promise<boolean> {
  let changed = false;
  for (const seasonNumber of seasonNumbers) {
    if (await monitorSeason(series, seasonNumber)) changed = true;
    // Asking again for a season half-stuck in the queue means the stuck release
    // has to go, or the search finds the same one and nothing moves.
    await discardStalled("series", series.id, seasonNumber);
    await sonarr.searchEpisodes(series.id, undefined, seasonNumber);
  }
  if (changed) invalidateLibraryIndex();
  return changed;
}

/** Whether seasons announced later are monitored. Says whether anything changed. */
async function setFollowing(series: SonarrSeries, follow: boolean): Promise<boolean> {
  if (isFollowing(series) === follow) return false;

  series.monitorNewItems = follow ? "all" : "none";
  if (follow) series.monitored = true;
  await sonarr.updateSeries(series.id, series);
  invalidateLibraryIndex();
  return true;
}

interface SeriesRequestInput extends SeriesRef {
  /** Seasons wanted now. Absent is every regular season, or nothing new for a series already held. */
  seasons?: number[];
  /** Keep up with new seasons. Absent follows a series still airing, or leaves a held one as it is. */
  follow?: boolean;
  requestedBy?: Requester;
  posterPath?: string;
}

/**
 * What a series request is recorded as. Everything, or following it, is the
 * series as a whole; a few seasons are those seasons, so each can be released
 * on its own.
 */
function requestScopes(
  series: SonarrSeries,
  seasons: number[] | undefined,
  follow: boolean,
): (number | undefined)[] {
  const regular = regularSeasons(series);
  const whole = seasons === undefined || regular.every((season) => seasons.includes(season));

  const scopes: (number | undefined)[] = [];
  if (whole || follow) scopes.push(undefined);
  if (!whole && seasons) scopes.push(...seasons);
  return scopes;
}

/**
 * Add a series with the seasons asked for, and whether to keep up with it, and
 * record who asked. For a series already held, the seasons asked for are
 * searched for and following is set as asked; nothing else changes.
 */
export async function requestSeries(
  input: SeriesRequestInput,
): Promise<{ status: RequestStatus; series: SonarrSeries }> {
  return withRequestedSeriesLock(input, async () => {
    const lookup = await lookupSeries(input);
    if (input.seasons) assertSeasons(lookup, input.seasons);

    const addition: SeriesAddition = {
      seasons: input.seasons ?? regularSeasons(lookup),
      follow: input.follow ?? isContinuing(lookup),
    };
    if (!lookup.id && addition.seasons.length === 0 && !addition.follow) {
      throw new NothingRequestedError();
    }

    const { added, series } = await findOrAddSeries(input, lookup, addition);

    let changed = false;
    if (!added && input.seasons) changed = await wantSeasons(series, input.seasons);
    if (!added && input.follow !== undefined) {
      changed = (await setFollowing(series, input.follow)) || changed;
    }
    const status: RequestStatus = added || changed ? "added" : "existing";

    if (input.requestedBy) {
      const follow = added ? addition.follow : input.follow === true;
      for (const seasonNumber of requestScopes(series, input.seasons, follow)) {
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
    }

    log.info("series requested", {
      status,
      term: seriesTerm(input),
      title: series.title,
      serviceId: series.id,
      seasons: input.seasons,
      follow: input.follow,
      userId: input.requestedBy?.userId,
    });
    return { status, series };
  });
}

/**
 * Keep up with a series already held, or stop. Following is asking for what
 * comes next, so whoever turns it on is recorded as having asked for the series.
 */
export async function followSeries(input: {
  serviceId: number;
  follow: boolean;
  requestedBy?: Requester;
}): Promise<{ series: SonarrSeries; changed: boolean }> {
  const { tvdbId } = await sonarr.getSeries(input.serviceId);
  return withDatabaseLock(`media:series:${tvdbId}`, async () => {
    const series = await sonarr.getSeries(input.serviceId);
    const changed = await setFollowing(series, input.follow);

    if (input.follow && input.requestedBy) {
      await recordRequest({
        requester: input.requestedBy,
        mediaType: "series",
        tmdbId: series.tmdbId,
        serviceId: series.id,
        title: series.title,
        year: series.year || undefined,
      });
    }

    log.info("series following set", {
      title: series.title,
      serviceId: series.id,
      follow: input.follow,
      changed,
    });
    return { series, changed };
  });
}

/**
 * Ask for one season: the unit people actually want, and the unit ownership is
 * kept in. A series Sonarr does not hold is added with that season alone
 * monitored, so nothing else is ever pulled in by adding it.
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
    const lookup = await lookupSeries(input);
    assertSeasons(lookup, [seasonNumber]);

    const { added, series } = await findOrAddSeries(input, lookup, {
      seasons: [seasonNumber],
      follow: false,
    });
    const changed = !added && (await wantSeasons(series, [seasonNumber]));

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

    const status: RequestStatus = added || changed ? "added" : "existing";
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
    const lookup = await lookupSeries(input);
    const { added, series } = await findOrAddSeries(input, lookup, { seasons: [], follow: false });
    const status: RequestStatus = added ? "added" : "existing";

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
