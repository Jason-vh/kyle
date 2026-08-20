import * as radarr from "../radarr/api.ts";
import * as sonarr from "../sonarr/api.ts";
import type { RequestableMediaType } from "./service.ts";
import { createLogger } from "../logger.ts";
import { errorMessage } from "../errors.ts";

const log = createLogger("requests-library");

const CACHE_TTL_MS = 60_000;

export type LibraryStatus = "available" | "pending";

export interface LibraryEntry {
  serviceId: number;
  status: LibraryStatus;
}

/** What Radarr and Sonarr already hold, keyed by TMDB id. */
type LibraryIndex = Record<RequestableMediaType, Map<number, LibraryEntry>>;

let cached: { value: LibraryIndex; expires: number } | null = null;

async function build(): Promise<LibraryIndex> {
  const [movies, series] = await Promise.all([radarr.getMovies(), sonarr.getAllSeries()]);

  const index: LibraryIndex = { movie: new Map(), series: new Map() };

  for (const movie of movies) {
    index.movie.set(movie.tmdbId, {
      serviceId: movie.id,
      status: movie.hasFile ? "available" : "pending",
    });
  }

  for (const show of series) {
    if (!show.tmdbId) continue;
    index.series.set(show.tmdbId, {
      serviceId: show.id,
      status: (show.statistics?.episodeFileCount ?? 0) > 0 ? "available" : "pending",
    });
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
