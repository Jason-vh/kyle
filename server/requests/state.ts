import type { LibraryMediaType, MediaRequest, MissingSeason, RequestState } from "#shared/types.ts";
import * as radarr from "#server/radarr/api.ts";
import * as sonarr from "#server/sonarr/api.ts";
import { getLibraryIndex, type LibraryEntry } from "./library.ts";
import { getRemovals, type Removal } from "#server/db/removals.ts";
import { getPlexPlaces, type PlexPlaces } from "#server/plex/catalog.ts";
import { watchKey } from "#server/plex/keys.ts";
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
  plexUrl?: string;
  progress?: number;
  eta?: string;
}

/** Where Plex has a title, and whether Plex could be asked at all. */
export interface PlexPlace {
  reachable: boolean;
  url?: string;
}

/** Everything one request's state is worked out from. */
export interface StateInputs {
  entry?: LibraryEntry;
  queue?: QueueStatus;
  removal?: Removal;
  plex?: PlexPlace;
  now?: Date;
}

/**
 * How long an imported file may be missing from Plex before its absence stops
 * meaning "not scanned yet". Past this, something is wrong with the match
 * rather than the scan, and calling it ready is the lesser lie.
 */
const SCAN_GRACE_MS = 6 * 60 * 60 * 1000;

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

/** A season has a progress of its own, and rolls up into the series' own key. */
function key(mediaType: string, serviceId: number, seasonNumber?: number | null): string {
  const scope = seasonNumber === undefined || seasonNumber === null ? "" : `:${seasonNumber}`;
  return `${mediaType}:${serviceId}${scope}`;
}

/** An unreachable Plex says nothing about a title, which is not the same as no. */
export function placeOf(
  places: PlexPlaces | undefined,
  media: { mediaType: LibraryMediaType; tmdbId: number },
): PlexPlace {
  if (!places) return { reachable: false };
  return { reachable: true, url: places.get(watchKey(media.mediaType, media.tmdbId)) };
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
export function resolveState({
  entry,
  queue,
  removal,
  plex,
  now = new Date(),
}: StateInputs): RequestStatus {
  if (!entry) return removedState(removal);
  if (queue && !entry.complete) return { ...queue, missing: entry.missing };
  if (entry.hasFiles) return onDiskState(entry, plex, now);
  if (!entry.monitored) return { state: "paused" };
  if (entry.awaiting) {
    return { state: entry.awaiting.reason, expectedAt: entry.awaiting.expectedAt };
  }
  return { state: "searching", since: entry.lastSearchedAt };
}

/**
 * On disk is not the same as watchable: Plex has to scan it first. Only a
 * recent import Plex has yet to show is held back, since Plex not knowing a
 * title could as easily mean it matched the file to nothing at all.
 */
function onDiskState(entry: LibraryEntry, plex: PlexPlace | undefined, now: Date): RequestStatus {
  if (plex?.reachable && !plex.url && justImported(entry.filesAddedAt, now)) {
    return { state: "importing", since: entry.filesAddedAt };
  }

  return { state: "ready", missing: entry.missing, plexUrl: plex?.url };
}

function justImported(filesAddedAt: string | undefined, now: Date): boolean {
  if (!filesAddedAt) return false;
  const added = new Date(filesAddedAt).getTime();
  return Number.isFinite(added) && now.getTime() - added < SCAN_GRACE_MS;
}

/**
 * Attach where each request has got to. Derived from what the services hold
 * and what their queues are doing, so it can never go stale — the cost is
 * that a title removed from the library reads as `removed`, whoever removed it.
 */
export async function withState(requests: StatelessRequest[]): Promise<MediaRequest[]> {
  if (requests.length === 0) return [];

  const [library, queues, removals, places] = await Promise.all([
    getLibraryIndex(),
    queuesByService(),
    getRemovals(),
    getPlexPlaces(),
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
      ...resolveState({
        entry: scope,
        queue,
        removal,
        plex: placeOf(places, request),
      }),
    };
  });
}
