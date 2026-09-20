import type { LibraryMediaType, MediaRequest, MissingSeason, RequestState } from "#shared/types.ts";
import * as radarr from "#server/radarr/api.ts";
import * as sonarr from "#server/sonarr/api.ts";
import { getLibraryIndex, type LibraryEntry } from "./library.ts";
import { getRemovals, type Removal } from "#server/db/removals.ts";
import { summarise, type QueueRecord, type QueueStatus } from "./queue.ts";
import { createLogger } from "#server/logger.ts";
import { errorMessage } from "#server/errors.ts";

const log = createLogger("request-state");

/** What a request looks like before its state has been worked out. */
export interface StatelessRequest {
  id: string;
  mediaType: LibraryMediaType;
  tmdbId: number;
  title: string;
  year: number | null;
  posterPath: string | null;
  requestedBy?: string;
  /** Which season was asked for; null is the series as a whole. */
  seasonNumber?: number | null;
  createdAt: Date | string;
}

/** Where a request has got to, and what the source knows about it. */
export interface RequestStatus {
  state: RequestState;
  detail?: string;
  expectedAt?: string;
  since?: string;
  missing?: MissingSeason[];
  progress?: number;
  eta?: string;
}

/** What one title's downloads amount to, or nothing if it has none. */
export async function queueStatusFor(
  mediaType: LibraryMediaType,
  serviceId: number,
): Promise<QueueStatus | undefined> {
  try {
    const queue =
      mediaType === "movie"
        ? await radarr.getQueue({ movieIds: [serviceId] })
        : await sonarr.getQueue({ seriesIds: [serviceId] });
    return summarise(queue.records);
  } catch (error) {
    log.warn("queue unavailable", { mediaType, serviceId, error: errorMessage(error) });
    return undefined;
  }
}

/**
 * What each season of one series has in its queue, so a season row says what
 * is happening to that season rather than to the series around it.
 */
export async function queueStatusBySeason(seriesId: number): Promise<Map<number, QueueStatus>> {
  const records = new Map<number, QueueRecord[]>();

  try {
    const queue = await sonarr.getQueue({ seriesIds: [seriesId] });
    for (const item of queue.records) {
      const seasonNumber = item.seasonNumber ?? item.episode?.seasonNumber;
      if (seasonNumber === undefined) continue;
      collect(records, seasonNumber, item);
    }
  } catch (error) {
    log.warn("queue unavailable", {
      mediaType: "series",
      serviceId: seriesId,
      error: errorMessage(error),
    });
    return new Map();
  }

  const statuses = new Map<number, QueueStatus>();
  for (const [seasonNumber, items] of records) {
    const status = summarise(items);
    if (status) statuses.set(seasonNumber, status);
  }
  return statuses;
}

/** A season has a queue of its own, and rolls up into the series' own key. */
function key(mediaType: string, serviceId: number, seasonNumber?: number | null): string {
  const scope = seasonNumber === undefined || seasonNumber === null ? "" : `:${seasonNumber}`;
  return `${mediaType}:${serviceId}${scope}`;
}

/**
 * Absence alone cannot say whether a title was taken out on purpose, so what
 * we recorded when it left is the answer, and silence is its own answer.
 */
function removedState(removal: Removal | undefined): RequestStatus {
  if (!removal) return { state: "removed" };

  return {
    state: "removed",
    detail: removal.removedBy ? `Removed by ${removal.removedBy}` : undefined,
    since: removal.at.toISOString(),
  };
}

function collect<K>(records: Map<K, QueueRecord[]>, at: K, record: QueueRecord): void {
  const existing = records.get(at);
  if (existing) existing.push(record);
  else records.set(at, [record]);
}

/**
 * What every queue is doing, keyed by the service id a request resolves to.
 * An unreachable service simply contributes nothing.
 */
async function queuesByService(): Promise<Map<string, QueueStatus>> {
  const records = new Map<string, QueueRecord[]>();

  const [movies, series] = await Promise.allSettled([radarr.getQueue(), sonarr.getQueue()]);

  if (movies.status === "fulfilled") {
    for (const item of movies.value.records) {
      if (item.movie?.id) collect(records, key("movie", item.movie.id), item);
    }
  } else {
    log.warn("radarr queue unavailable", { error: errorMessage(movies.reason) });
  }

  // An episode's download belongs to its season as well as to the series, so a
  // request for one season sees only what is being fetched for that season.
  if (series.status === "fulfilled") {
    for (const item of series.value.records) {
      if (!item.seriesId) continue;
      collect(records, key("series", item.seriesId), item);

      const seasonNumber = item.seasonNumber ?? item.episode?.seasonNumber;
      if (seasonNumber !== undefined) {
        collect(records, key("series", item.seriesId, seasonNumber), item);
      }
    }
  } else {
    log.warn("sonarr queue unavailable", { error: errorMessage(series.reason) });
  }

  const statuses = new Map<string, QueueStatus>();
  for (const [at, items] of records) {
    const status = summarise(items);
    if (status) statuses.set(at, status);
  }

  return statuses;
}

/**
 * What the request was for: the whole series, or the one season it named. A
 * season the series no longer lists was released or never existed, which reads
 * the same way as a title removed from the library.
 */
export function scopeOf(
  entry: LibraryEntry | undefined,
  seasonNumber: number | null | undefined,
): LibraryEntry | undefined {
  if (!entry) return undefined;
  if (seasonNumber === undefined || seasonNumber === null) return entry;
  return entry.seasons?.get(seasonNumber);
}

/**
 * What the requester should expect next. The queue speaks first — it is the
 * only thing actually moving — except for a title already complete on disk,
 * whose queue can only be an upgrade nobody is waiting on. A series carries
 * the seasons it is still short of, which its own row would otherwise hide.
 */
export function resolveState(
  entry: LibraryEntry | undefined,
  queue: QueueStatus | undefined,
  removal?: Removal,
): RequestStatus {
  if (!entry) return removedState(removal);
  if (queue && !entry.complete) return { ...queue, missing: entry.missing };
  if (entry.hasFiles) return { state: "ready", missing: entry.missing };
  if (!entry.monitored) return { state: "paused" };
  if (entry.awaiting) {
    return { state: entry.awaiting.reason, expectedAt: entry.awaiting.expectedAt };
  }
  return { state: "searching", since: entry.lastSearchedAt };
}

/**
 * Attach where each request has got to. Derived from what the services hold
 * and what their queues are doing, so it can never go stale — the cost is
 * that a title removed from the library reads as `removed`, whoever removed it.
 */
export async function withState(requests: StatelessRequest[]): Promise<MediaRequest[]> {
  if (requests.length === 0) return [];

  const [library, queues, removals] = await Promise.all([
    getLibraryIndex(),
    queuesByService(),
    getRemovals(),
  ]);

  return requests.map((request) => {
    const entry = library[request.mediaType].get(request.tmdbId);
    const scope = scopeOf(entry, request.seasonNumber);
    const queue = entry
      ? queues.get(key(request.mediaType, entry.serviceId, request.seasonNumber))
      : undefined;
    const removal = removals.get(key(request.mediaType, request.tmdbId));

    return {
      ...request,
      seasonNumber: request.seasonNumber ?? null,
      createdAt: new Date(request.createdAt).toISOString(),
      ...resolveState(scope, queue, removal),
    };
  });
}
