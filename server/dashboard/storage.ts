import type { StorageStat } from "../../shared/types.ts";
import * as radarr from "../radarr/api.ts";
import * as sonarr from "../sonarr/api.ts";
import { createLogger } from "../logger.ts";
import { errorMessage } from "../errors.ts";

const log = createLogger("dashboard-storage");

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
function mountFor(path: string, mounts: Mount[]): Mount | undefined {
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
 * Space where the media actually lives. Radarr answers for it, and Sonarr is
 * asked only if Radarr cannot — they are almost always the same disk.
 */
export async function getStorage(): Promise<StorageStat | undefined> {
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

export const __testing = { mountFor };
