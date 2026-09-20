import * as qbittorrent from "#server/qbittorrent/api.ts";
import * as radarr from "#server/radarr/api.ts";
import * as sonarr from "#server/sonarr/api.ts";
import type { JanitorAction } from "./plan.ts";

/**
 * Does one decided thing. A torrent goes with its files — seeding a copy of a
 * file the library has replaced is the space this exists to free. A stalled
 * download is blocklisted before the search that follows, so the same release
 * cannot be picked up again.
 */
export async function applyAction(action: JanitorAction): Promise<void> {
  switch (action.kind) {
    case "delete-torrent":
      await qbittorrent.deleteTorrents([action.hash], true);
      return;
    case "retry-download":
      if (action.mediaType === "movie") {
        await radarr.removeQueueItem(action.queueId, true);
        await radarr.searchMovie(action.serviceId);
      } else {
        await sonarr.removeQueueItem(action.queueId, true);
        await sonarr.searchEpisodes(action.serviceId);
      }
      return;
    case "discard-download":
      if (action.mediaType === "movie") await radarr.removeQueueItem(action.queueId, true);
      else await sonarr.removeQueueItem(action.queueId, true);
      return;
    case "flag":
      return;
  }
}
