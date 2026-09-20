import type { StorageStat } from "#shared/types.ts";
import * as radarr from "#server/radarr/api.ts";
import * as sonarr from "#server/sonarr/api.ts";
import * as ultra from "#server/ultra/api.ts";
import { getAllRequesters } from "#server/db/requests.ts";
import { createLogger } from "#server/logger.ts";
import { errorMessage } from "#server/errors.ts";

const log = createLogger("dashboard-storage");

/** The units `quota -s` speaks, which Ultra passes on verbatim. */
const UNIT_BYTES: Record<string, number> = {
  K: 1024,
  M: 1024 ** 2,
  G: 1024 ** 3,
  T: 1024 ** 4,
};

interface Mount {
  path: string;
  freeSpace: number;
  totalSpace: number;
}

/**
 * The mount a path sits on: the longest one it starts with. `/home/x/media`
 * matches `/home/x` over `/`, which is the difference between the media disk
 * and the root filesystem.
 */
export function mountFor(path: string, mounts: Mount[]): Mount | undefined {
  return mounts
    .filter((mount) => {
      // `/` is already its own separator; every other mount needs one adding,
      // or `/home/jasonvh` would look like it sits inside `/home/jason`.
      const prefix = mount.path.endsWith("/") ? mount.path : `${mount.path}/`;
      return path === mount.path || path.startsWith(prefix);
    })
    .sort((a, b) => b.path.length - a.path.length)[0];
}

async function fromService(
  getRootFolders: () => Promise<{ path: string; freeSpace: number }[]>,
  getDiskSpace: () => Promise<Mount[]>,
): Promise<StorageStat | undefined> {
  const [roots, mounts] = await Promise.all([getRootFolders(), getDiskSpace()]);

  const root = roots[0];
  if (!root) return undefined;

  const mount = mountFor(root.path, mounts);
  if (!mount) return undefined;

  // The root folder's own figure is the fresher of the two; only the total
  // has to come from the mount, which is the one thing it cannot report.
  return { freeBytes: root.freeSpace, totalBytes: mount.totalSpace };
}

/**
 * The seedbox quota, which is the limit that actually bites: Radarr and Sonarr
 * see the whole array underneath and report space this slot may never use.
 */
async function fromUltra(): Promise<StorageStat> {
  const stats = await ultra.getStats();
  const unit = UNIT_BYTES[stats.total_storage_unit] ?? 1;

  return {
    freeBytes: stats.free_storage_bytes,
    totalBytes: stats.total_storage_value * unit,
  };
}

/** What the titles someone asked for take up, across both services. */
export async function getRequestedBytes(): Promise<number | undefined> {
  try {
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
  } catch (error) {
    log.warn("could not measure what was requested", { error: errorMessage(error) });
    return undefined;
  }
}

/**
 * Space where the media actually lives. The seedbox quota answers for it; the
 * services are asked only when Ultra cannot, and they see the array rather
 * than this slot's share of it.
 */
export async function getStorage(): Promise<StorageStat | undefined> {
  const [stat, requestedBytes] = await Promise.all([capacity(), getRequestedBytes()]);
  return stat && { ...stat, requestedBytes };
}

async function capacity(): Promise<StorageStat | undefined> {
  try {
    return await fromUltra();
  } catch (error) {
    log.warn("ultra could not report the quota", { error: errorMessage(error) });
  }

  try {
    return await fromService(radarr.getRootFolders, radarr.getDiskSpace);
  } catch (error) {
    log.warn("radarr could not report storage", { error: errorMessage(error) });
  }

  try {
    return await fromService(sonarr.getRootFolders, sonarr.getDiskSpace);
  } catch (error) {
    log.error("could not read storage", { error: errorMessage(error) });
    return undefined;
  }
}
