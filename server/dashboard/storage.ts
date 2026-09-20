import type { StorageStat } from "#shared/types.ts";
import * as radarr from "#server/radarr/api.ts";
import * as sonarr from "#server/sonarr/api.ts";
import * as ultra from "#server/ultra/api.ts";
import { getAllRequesters } from "#server/db/requests.ts";

/** The units `quota -s` speaks, which Ultra passes on verbatim. */
const UNIT_BYTES: Record<string, number> = {
  K: 1024,
  M: 1024 ** 2,
  G: 1024 ** 3,
  T: 1024 ** 4,
};

/**
 * The seedbox quota, which is the only figure that means anything here: Radarr
 * and Sonarr see the whole array underneath and report space this slot may
 * never use. Being unable to ask is said out loud rather than answered wrongly.
 */
export async function getStorage(): Promise<StorageStat> {
  const stats = await ultra.getStats();
  const unit = UNIT_BYTES[stats.total_storage_unit] ?? 1;

  return {
    freeBytes: stats.free_storage_bytes,
    totalBytes: stats.total_storage_value * unit,
  };
}

/** What the titles someone asked for take up, across both services. */
export async function getRequestedBytes(): Promise<number> {
  const [requests, movies, series] = await Promise.all([
    getAllRequesters(),
    radarr.getMovies(),
    sonarr.getAllSeries(),
  ]);

  const requested = new Set(requests.map((request) => `${request.mediaType}:${request.tmdbId}`));

  const movieBytes = movies
    .filter((movie) => requested.has(`movie:${movie.tmdbId}`))
    .reduce((total, movie) => total + (movie.sizeOnDisk ?? 0), 0);

  const seriesBytes = series
    .filter((show) => requested.has(`series:${show.tmdbId}`))
    .reduce((total, show) => total + (show.statistics?.sizeOnDisk ?? 0), 0);

  return movieBytes + seriesBytes;
}
