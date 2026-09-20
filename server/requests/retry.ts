import type { LibraryMediaType } from "#shared/types.ts";
import * as radarr from "#server/radarr/api.ts";
import * as sonarr from "#server/sonarr/api.ts";
import { classify, type QueueRecord } from "./queue.ts";
import { createLogger } from "#server/logger.ts";

const log = createLogger("request-retry");

export interface RetryOutcome {
  /** Stalled downloads dropped and blocklisted, so the same one is not grabbed again. */
  discarded: number;
}

interface Identified extends QueueRecord {
  id: number;
}

/**
 * Downloads worth giving up on: stalled ones, which will sit at the same
 * percentage forever. A blocked import has the file already and needs a
 * person, not another release.
 */
export function discardable<T extends Identified>(records: T[]): T[] {
  return records.filter((record) => classify(record).state === "stalled");
}

async function queueRecordsFor(
  mediaType: LibraryMediaType,
  serviceId: number,
  seasonNumber?: number,
): Promise<Identified[]> {
  if (mediaType === "movie") {
    const queue = await radarr.getQueue({ movieIds: [serviceId] });
    return queue.records;
  }

  const queue = await sonarr.getQueue({ seriesIds: [serviceId] });
  if (seasonNumber === undefined) return queue.records;

  return queue.records.filter(
    (record) => (record.seasonNumber ?? record.episode?.seasonNumber) === seasonNumber,
  );
}

async function discard(mediaType: LibraryMediaType, id: number): Promise<void> {
  if (mediaType === "movie") await radarr.removeQueueItem(id, true);
  else await sonarr.removeQueueItem(id, true);
}

async function search(
  mediaType: LibraryMediaType,
  serviceId: number,
  seasonNumber?: number,
): Promise<void> {
  if (mediaType === "movie") await radarr.searchMovie(serviceId);
  else await sonarr.searchEpisodes(serviceId, undefined, seasonNumber);
}

/**
 * Give up on whatever has stuck, so the search that follows has to find a
 * different release rather than the one that stalled. Scoped to a season where
 * one is named, since the rest of the series may be downloading happily.
 */
export async function discardStalled(
  mediaType: LibraryMediaType,
  serviceId: number,
  seasonNumber?: number,
): Promise<number> {
  const stalled = discardable(await queueRecordsFor(mediaType, serviceId, seasonNumber));

  for (const record of stalled) {
    await discard(mediaType, record.id);
  }

  return stalled.length;
}

/**
 * Look again. A stalled release is blocklisted first, so the search that
 * follows has to find a different one rather than the release that stuck.
 */
export async function retryRequest(
  mediaType: LibraryMediaType,
  serviceId: number,
  seasonNumber?: number,
): Promise<RetryOutcome> {
  const discarded = await discardStalled(mediaType, serviceId, seasonNumber);

  await search(mediaType, serviceId, seasonNumber);

  log.info("retried a request", { mediaType, serviceId, seasonNumber, discarded });
  return { discarded };
}
