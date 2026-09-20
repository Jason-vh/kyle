import type { QBittorrentTorrent } from "#server/qbittorrent/api.ts";
import type { QueueEntry, SweepState, TorrentOrigin } from "./plan.ts";
import * as qbittorrent from "#server/qbittorrent/api.ts";
import * as radarr from "#server/radarr/api.ts";
import * as sonarr from "#server/sonarr/api.ts";
import { classify } from "#server/requests/queue.ts";

const IMPORTED = "downloadfolderimported";

/** How many torrents are resolved at once, so a sweep does not flood a service. */
const BATCH = 5;

function fileIdOf(data: Record<string, unknown> | undefined): number | undefined {
  const raw = data?.fileId;
  const id = typeof raw === "string" ? Number.parseInt(raw, 10) : raw;
  return typeof id === "number" && Number.isFinite(id) ? id : undefined;
}

async function importedFiles(
  hash: string,
): Promise<{ known: boolean; imports: { fileId: number; alive: boolean }[] }> {
  const [movieHistory, seriesHistory] = await Promise.all([
    radarr.getDownloadHistory(hash),
    sonarr.getDownloadHistory(hash),
  ]);

  const known = movieHistory.length > 0 || seriesHistory.length > 0;

  const movieFileIds = movieHistory
    .filter((record) => record.eventType.toLowerCase() === IMPORTED)
    .map((record) => fileIdOf(record.data));

  const episodeFileIds = seriesHistory
    .filter((record) => record.eventType.toLowerCase() === IMPORTED)
    .map((record) => fileIdOf(record.data));

  const imports = await Promise.all([
    ...movieFileIds.map(async (fileId) => {
      if (fileId === undefined) return undefined;
      return { fileId, alive: (await radarr.getMovieFile(fileId)) !== undefined };
    }),
    ...episodeFileIds.map(async (fileId) => {
      if (fileId === undefined) return undefined;
      return { fileId, alive: (await sonarr.getEpisodeFile(fileId)) !== undefined };
    }),
  ]);

  return { known, imports: imports.filter((file) => file !== undefined) };
}

async function resolve(torrent: QBittorrentTorrent, queued: Set<string>): Promise<TorrentOrigin> {
  const { known, imports } = await importedFiles(torrent.hash);

  return {
    hash: torrent.hash,
    name: torrent.name,
    bytes: torrent.size,
    // A grab the service gave up on never completed, so its added date is the
    // honest clock: both say it has had its chance.
    completedAt: torrent.completion_on || torrent.added_on,
    known,
    imports,
    queued: queued.has(torrent.hash.toLowerCase()),
  };
}

async function queueEntries(): Promise<{ entries: QueueEntry[]; downloadIds: Set<string> }> {
  const [movies, series] = await Promise.all([radarr.getQueue(), sonarr.getQueue()]);

  const entries: QueueEntry[] = [
    ...movies.records.map((record) => ({
      mediaType: "movie" as const,
      queueId: record.id,
      serviceId: record.movie?.id ?? 0,
      title: record.movie?.title ?? record.title,
      status: classify(record),
    })),
    ...series.records.map((record) => ({
      mediaType: "series" as const,
      queueId: record.id,
      serviceId: record.seriesId ?? record.series?.id ?? 0,
      title: record.series?.title ?? record.title,
      status: classify(record),
    })),
  ];

  const downloadIds = [...movies.records, ...series.records]
    .map((record) => record.downloadId?.toLowerCase())
    .filter((id) => id !== undefined);

  return { entries, downloadIds: new Set(downloadIds) };
}

/**
 * Everything the sweep decides from. Anything that throws here aborts the
 * whole sweep, and that is the point: a service that cannot be asked about a
 * torrent looks exactly like a service that has never heard of it, and the
 * second of those is a reason to delete 60 GB.
 */
export async function gatherSweepState(): Promise<SweepState> {
  const { entries, downloadIds } = await queueEntries();
  const torrents = await qbittorrent.getTorrents("all");

  const resolved: TorrentOrigin[] = [];
  for (let index = 0; index < torrents.length; index += BATCH) {
    const batch = torrents.slice(index, index + BATCH);
    resolved.push(...(await Promise.all(batch.map((torrent) => resolve(torrent, downloadIds)))));
  }

  return { torrents: resolved, queue: entries };
}
