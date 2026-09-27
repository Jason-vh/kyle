import * as radarr from "#server/radarr/api.ts";
import * as sonarr from "#server/sonarr/api.ts";
import type { MissingSeason } from "#shared/types.ts";
import type { RadarrMovie } from "#server/radarr/types.ts";
import type { SonarrSeason, SonarrSeries } from "#server/sonarr/types.ts";
import type { RequestableMediaType } from "./service.ts";
import { createLogger } from "#server/logger.ts";
import { errorMessage } from "#server/errors.ts";
import { cached } from "#server/cache.ts";

const log = createLogger("requests-library");

const CACHE_TTL_MS = 60_000;

export type LibraryStatus = "available" | "pending" | "unknown";

/** Why a service cannot go and fetch a title yet. */
export interface Awaiting {
  /** `unreleased`: out nowhere. `waiting`: out, but not in a form we can fetch. */
  reason: "unreleased" | "waiting";
  /** ISO 8601 of when that changes, when the service knows a date. */
  expectedAt?: string;
}

export interface LibraryEntry {
  serviceId: number;
  /** Something is still being looked for, which a monitored flag alone does not say. */
  monitored: boolean;
  hasFiles: boolean;
  /** Everything the service counts is on disk, so nothing is left to fetch. */
  complete: boolean;
  /** Seasons a series is still short of, which a whole-series count hides. */
  missing?: MissingSeason[];
  /** ISO 8601 of the last search, where the service records one. */
  lastSearchedAt?: string;
  /** ISO 8601 of when the file landed, which is when Plex has yet to scan it. */
  filesAddedAt?: string;
  /** Absent once the service can search for it. */
  awaiting?: Awaiting;
  /** The same questions asked of each season, for a series. */
  seasons?: Map<number, LibraryEntry>;
}

/** What Radarr and Sonarr already hold, keyed by TMDB id. */
type LibraryIndex = Record<RequestableMediaType, Map<number, LibraryEntry>> & {
  unavailable: RequestableMediaType[];
};

const UNRELEASED_STATUSES = new Set(["tba", "announced"]);

function isAhead(date: string | undefined, now: Date): boolean {
  return date !== undefined && new Date(date) > now;
}

/**
 * Radarr will search whatever the calendar says once minimum availability is
 * met, so the release status is the gate rather than `isAvailable`: a film
 * announced and nothing more is not going to be found, however hard it looks.
 */
function movieAwaiting(movie: RadarrMovie, now: Date): Awaiting | undefined {
  if (movie.hasFile) return undefined;

  if (UNRELEASED_STATUSES.has(movie.status)) {
    return {
      reason: "unreleased",
      expectedAt: movie.inCinemas ?? movie.digitalRelease ?? movie.releaseDate,
    };
  }

  const fetchableFrom = movie.digitalRelease ?? movie.physicalRelease ?? movie.releaseDate;
  if (movie.status === "inCinemas" || isAhead(fetchableFrom, now)) {
    return { reason: "waiting", expectedAt: fetchableFrom };
  }

  return undefined;
}

export function movieEntry(movie: RadarrMovie, now = new Date()): LibraryEntry {
  return {
    serviceId: movie.id,
    monitored: movie.monitored,
    hasFiles: movie.hasFile,
    complete: movie.hasFile,
    lastSearchedAt: movie.lastSearchTime,
    filesAddedAt: movie.movieFile?.dateAdded,
    awaiting: movieAwaiting(movie, now),
  };
}

/**
 * Seasons nobody is monitoring are nobody's concern, and specials are not what
 * anyone means by "the series".
 */
function shortfallOf(seasons: SonarrSeason[] = []): MissingSeason[] {
  const missing: MissingSeason[] = [];

  for (const season of seasons) {
    if (season.seasonNumber === 0 || !season.monitored) continue;
    const gap = (season.statistics?.episodeCount ?? 0) - (season.statistics?.episodeFileCount ?? 0);
    if (gap > 0) missing.push({ season: season.seasonNumber, episodes: gap });
  }

  return missing;
}

/** What Sonarr counts of a series or a season: only the monitored episodes, aired or on disk. */
interface Counts {
  episodeCount?: number;
  episodeFileCount?: number;
  totalEpisodeCount?: number;
}

/**
 * Whether anything is still being looked for. Sonarr counts only monitored
 * episodes, so a count of nought cannot tell "nothing has aired" from "nothing
 * is monitored": only an episode still to come, or none listed at all, means
 * something is on its way.
 */
function lookingFor(monitored: boolean, counts: Counts = {}, nextAiring?: string): boolean {
  if (!monitored) return false;
  const wanted = counts.episodeCount ?? 0;
  const present = counts.episodeFileCount ?? 0;
  return wanted > present || nextAiring !== undefined || (counts.totalEpisodeCount ?? 0) === 0;
}

/**
 * One season asked what the series is asked, so a request for a season can be
 * answered by the same state model as a request for all of it.
 */
export function seasonEntry(series: SonarrSeries, season: SonarrSeason): LibraryEntry {
  const present = season.statistics?.episodeFileCount ?? 0;
  const wanted = season.statistics?.episodeCount ?? 0;
  const gap = wanted - present;
  const next = season.statistics?.nextAiring;
  const looking = lookingFor(season.monitored, season.statistics, next);

  return {
    serviceId: series.id,
    monitored: looking,
    hasFiles: present > 0,
    complete: wanted > 0 && gap === 0,
    missing: gap > 0 ? [{ season: season.seasonNumber, episodes: gap }] : undefined,
    awaiting:
      looking && wanted === 0
        ? { reason: "unreleased", expectedAt: next ?? series.nextAiring }
        : undefined,
  };
}

export function seriesEntry(series: SonarrSeries): LibraryEntry {
  const present = series.statistics?.episodeFileCount ?? 0;
  const wanted = series.statistics?.episodeCount ?? 0;
  const missing = shortfallOf(series.seasons);
  const looking = lookingFor(series.monitored, series.statistics, series.nextAiring);

  return {
    serviceId: series.id,
    monitored: looking,
    hasFiles: present > 0,
    complete: wanted > 0 && missing.length === 0,
    missing: missing.length > 0 ? missing : undefined,
    awaiting:
      looking && wanted === 0
        ? { reason: "unreleased", expectedAt: series.nextAiring ?? series.firstAired }
        : undefined,
    seasons: new Map(
      (series.seasons ?? []).map((season) => [season.seasonNumber, seasonEntry(series, season)]),
    ),
  };
}

export function libraryStatusOf(entry: LibraryEntry): LibraryStatus {
  return entry.hasFiles ? "available" : "pending";
}

async function build(): Promise<LibraryIndex> {
  const [movies, series] = await Promise.allSettled([radarr.getMovies(), sonarr.getAllSeries()]);
  const index: LibraryIndex = { movie: new Map(), series: new Map(), unavailable: [] };

  if (movies.status === "fulfilled") {
    for (const movie of movies.value) index.movie.set(movie.tmdbId, movieEntry(movie));
  } else {
    index.unavailable.push("movie");
    log.error("Radarr unavailable", { error: errorMessage(movies.reason) });
  }

  if (series.status === "fulfilled") {
    for (const show of series.value) {
      if (show.tmdbId) index.series.set(show.tmdbId, seriesEntry(show));
    }
  } else {
    index.unavailable.push("series");
    log.error("Sonarr unavailable", { error: errorMessage(series.reason) });
  }

  log.info("library index built", {
    movies: index.movie.size,
    series: index.series.size,
    unavailable: index.unavailable,
  });
  return index;
}

const libraryIndex = cached(CACHE_TTL_MS, build);

export function getLibraryIndex(): Promise<LibraryIndex> {
  return libraryIndex.get();
}

export function invalidateLibraryIndex(): void {
  libraryIndex.invalidate();
}
