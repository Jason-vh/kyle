import type { LibraryMediaType, MediaRequest, RequestState } from "../../shared/types.ts";
import * as radarr from "../radarr/api.ts";
import * as sonarr from "../sonarr/api.ts";
import { getLibraryIndex } from "./library.ts";
import { createLogger } from "../logger.ts";
import { errorMessage } from "../errors.ts";

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

interface Progress {
  progress: number;
  eta?: string;
}

function key(mediaType: string, serviceId: number): string {
  return `${mediaType}:${serviceId}`;
}

/**
 * How far along everything currently downloading is, keyed by the service id
 * the request resolved to. An unreachable service simply contributes nothing.
 */
async function downloadProgress(): Promise<Map<string, Progress>> {
  const progress = new Map<string, Progress>();

  const [movies, series] = await Promise.allSettled([radarr.getQueue(), sonarr.getQueue()]);

  if (movies.status === "fulfilled") {
    for (const item of movies.value.records) {
      if (!item.movie?.id || !item.size) continue;
      progress.set(key("movie", item.movie.id), {
        progress: 1 - item.sizeleft / item.size,
        eta: item.timeleft,
      });
    }
  } else {
    log.warn("radarr queue unavailable", { error: errorMessage(movies.reason) });
  }

  // A series downloads episode by episode; the furthest along is the one worth
  // showing, since it is the next thing that will become watchable.
  if (series.status === "fulfilled") {
    for (const item of series.value.records) {
      if (!item.seriesId || !item.size) continue;
      const at = key("series", item.seriesId);
      const next = { progress: 1 - item.sizeleft / item.size, eta: item.timeleft };
      const current = progress.get(at);
      if (!current || next.progress > current.progress) progress.set(at, next);
    }
  } else {
    log.warn("sonarr queue unavailable", { error: errorMessage(series.reason) });
  }

  return progress;
}

/**
 * Downloading beats everything: a series already partly on disk is still
 * worth showing as busy. Nothing in the library at all means it was removed
 * after being asked for.
 */
export function resolveState(
  entry: { status: string } | undefined,
  downloading: boolean,
): RequestState {
  if (downloading) return "downloading";
  if (!entry) return "unavailable";
  return entry.status === "available" ? "available" : "pending";
}

/**
 * Attach where each request has got to. Derived from what the services hold
 * and what they are downloading right now, so it can never go stale — the
 * cost is that a title removed from the library reads as `unavailable`.
 */
export async function withState(requests: StatelessRequest[]): Promise<MediaRequest[]> {
  if (requests.length === 0) return [];

  const [library, progress] = await Promise.all([getLibraryIndex(), downloadProgress()]);

  return requests.map((request) => {
    const entry = library[request.mediaType].get(request.tmdbId);
    const downloading = entry ? progress.get(key(request.mediaType, entry.serviceId)) : undefined;

    return {
      ...request,
      createdAt: new Date(request.createdAt).toISOString(),
      state: resolveState(entry, downloading !== undefined),
      progress: downloading?.progress,
      eta: downloading?.eta,
    };
  });
}
