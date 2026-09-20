import type { LibraryMediaType, MediaRequest, RequestState } from "#shared/types.ts";
import * as radarr from "#server/radarr/api.ts";
import * as sonarr from "#server/sonarr/api.ts";
import { getLibraryIndex, type LibraryEntry } from "./library.ts";
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
  createdAt: Date | string;
}

/** Where a request has got to, and what the source knows about it. */
export interface RequestStatus {
  state: RequestState;
  detail?: string;
  expectedAt?: string;
  since?: string;
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

function key(mediaType: string, serviceId: number): string {
  return `${mediaType}:${serviceId}`;
}

function collect(records: Map<string, QueueRecord[]>, at: string, record: QueueRecord): void {
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

  if (series.status === "fulfilled") {
    for (const item of series.value.records) {
      if (item.seriesId) collect(records, key("series", item.seriesId), item);
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
 * What the requester should expect next. The queue speaks first — it is the
 * only thing actually moving — except for a title already complete on disk,
 * whose queue can only be an upgrade nobody is waiting on.
 */
export function resolveState(
  entry: LibraryEntry | undefined,
  queue: QueueStatus | undefined,
): RequestStatus {
  if (!entry) return { state: "removed" };
  if (queue && !entry.complete) return queue;
  if (entry.hasFiles) return { state: "ready" };
  if (!entry.monitored) return { state: "paused" };
  if (entry.awaiting) {
    return { state: entry.awaiting.reason, expectedAt: entry.awaiting.expectedAt };
  }
  return { state: "searching" };
}

/**
 * Attach where each request has got to. Derived from what the services hold
 * and what their queues are doing, so it can never go stale — the cost is
 * that a title removed from the library reads as `removed`, whoever removed it.
 */
export async function withState(requests: StatelessRequest[]): Promise<MediaRequest[]> {
  if (requests.length === 0) return [];

  const [library, queues] = await Promise.all([getLibraryIndex(), queuesByService()]);

  return requests.map((request) => {
    const entry = library[request.mediaType].get(request.tmdbId);
    const queue = entry ? queues.get(key(request.mediaType, entry.serviceId)) : undefined;

    return {
      ...request,
      createdAt: new Date(request.createdAt).toISOString(),
      ...resolveState(entry, queue),
    };
  });
}
