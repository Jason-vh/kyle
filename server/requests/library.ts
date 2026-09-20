import * as radarr from "#server/radarr/api.ts";
import * as sonarr from "#server/sonarr/api.ts";
import type { RadarrMovie } from "#server/radarr/types.ts";
import type { SonarrSeries } from "#server/sonarr/types.ts";
import type { RequestableMediaType } from "./service.ts";
import { createLogger } from "#server/logger.ts";
import { errorMessage } from "#server/errors.ts";

const log = createLogger("requests-library");

const CACHE_TTL_MS = 60_000;

export type LibraryStatus = "available" | "pending";

/** Why a service cannot go and fetch a title yet. */
export interface Awaiting {
  /** `unreleased`: out nowhere. `waiting`: out, but not in a form we can fetch. */
  reason: "unreleased" | "waiting";
  /** ISO 8601 of when that changes, when the service knows a date. */
  expectedAt?: string;
}

export interface LibraryEntry {
  serviceId: number;
  monitored: boolean;
  hasFiles: boolean;
  /** Everything the service counts is on disk, so nothing is left to fetch. */
  complete: boolean;
  /** Absent once the service can search for it. */
  awaiting?: Awaiting;
}

/** What Radarr and Sonarr already hold, keyed by TMDB id. */
type LibraryIndex = Record<RequestableMediaType, Map<number, LibraryEntry>>;

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
    awaiting: movieAwaiting(movie, now),
  };
}

/** Sonarr counts only episodes that have aired, so none means none yet. */
export function seriesEntry(series: SonarrSeries): LibraryEntry {
  const present = series.statistics?.episodeFileCount ?? 0;
  const aired = series.statistics?.episodeCount ?? 0;

  return {
    serviceId: series.id,
    monitored: series.monitored,
    hasFiles: present > 0,
    complete: aired > 0 && present >= aired,
    awaiting:
      aired === 0
        ? { reason: "unreleased", expectedAt: series.nextAiring ?? series.firstAired }
        : undefined,
  };
}

export function libraryStatusOf(entry: LibraryEntry): LibraryStatus {
  return entry.hasFiles ? "available" : "pending";
}

let cached: { value: LibraryIndex; expires: number } | null = null;

async function build(): Promise<LibraryIndex> {
  const [movies, series] = await Promise.all([radarr.getMovies(), sonarr.getAllSeries()]);

  const index: LibraryIndex = { movie: new Map(), series: new Map() };

  for (const movie of movies) {
    index.movie.set(movie.tmdbId, movieEntry(movie));
  }

  for (const show of series) {
    if (!show.tmdbId) continue;
    index.series.set(show.tmdbId, seriesEntry(show));
  }

  return index;
}

/**
 * Cached view of the library, so a page of search results costs one refresh
 * rather than a lookup per title. An unreachable service yields an empty
 * index, which shows everything as requestable rather than failing the search.
 */
export async function getLibraryIndex(): Promise<LibraryIndex> {
  if (cached && cached.expires > Date.now()) return cached.value;

  try {
    const value = await build();
    cached = { value, expires: Date.now() + CACHE_TTL_MS };
    log.info("library index built", { movies: value.movie.size, series: value.series.size });
    return value;
  } catch (error) {
    log.error("could not read the library", { error: errorMessage(error) });
    return { movie: new Map(), series: new Map() };
  }
}

export function invalidateLibraryIndex(): void {
  cached = null;
}
