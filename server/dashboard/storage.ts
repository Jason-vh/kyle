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

function titleKey(mediaType: string, tmdbId: number | undefined): string {
  return `${mediaType}:${tmdbId}`;
}

async function sizesByTitle(): Promise<Map<string, number>> {
  const [movies, series] = await Promise.all([radarr.getMovies(), sonarr.getAllSeries()]);
  return new Map([
    ...movies.map((movie) => [titleKey("movie", movie.tmdbId), movie.sizeOnDisk ?? 0] as const),
    ...series.map(
      (show) => [titleKey("series", show.tmdbId), show.statistics?.sizeOnDisk ?? 0] as const,
    ),
  ]);
}

function totalOf(keys: Set<string>, sizes: Map<string, number>): number {
  let total = 0;
  for (const key of keys) total += sizes.get(key) ?? 0;
  return total;
}

/** What the titles someone asked for take up, across both services. */
export async function getRequestedBytes(): Promise<number> {
  const [requests, sizes] = await Promise.all([getAllRequesters(), sizesByTitle()]);
  const requested = new Set(requests.map((request) => titleKey(request.mediaType, request.tmdbId)));
  return totalOf(requested, sizes);
}

/** The same, for each person: a title two people asked for counts for both. */
export async function getRequestedBytesByUser(): Promise<Map<string, number>> {
  const [requests, sizes] = await Promise.all([getAllRequesters(), sizesByTitle()]);

  const byUser = new Map<string, Set<string>>();
  for (const request of requests) {
    const keys = byUser.get(request.userId) ?? new Set<string>();
    keys.add(titleKey(request.mediaType, request.tmdbId));
    byUser.set(request.userId, keys);
  }

  return new Map([...byUser].map(([userId, keys]) => [userId, totalOf(keys, sizes)]));
}
