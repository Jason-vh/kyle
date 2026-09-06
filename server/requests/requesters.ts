import type { LibraryMediaType } from "#shared/types.ts";

/** A request, as the database reports it for annotating a list of media. */
export interface Requester {
  mediaType: string;
  tmdbId: number;
  userId: string;
  name: string;
}

/** Anything a request can be matched to: the library, the activity feed. */
export interface Attributable {
  mediaType: LibraryMediaType;
  /** Absent for media the services cannot map to TMDB, which matches nothing. */
  tmdbId?: number;
  requestedBy: string[];
  requestedByMe: boolean;
}

/** `movie:550` — the two services number their ids independently. */
function key(mediaType: string, tmdbId: number): string {
  return `${mediaType}:${tmdbId}`;
}

/**
 * Name whoever asked for each item, and mark the viewer's own.
 *
 * Only media requested through Kyle matches; anything added before, or by
 * hand, simply has no requester.
 */
export function annotateRequesters<T extends Attributable>(
  items: T[],
  viewerId: string,
  requests: Requester[],
): void {
  if (requests.length === 0) return;

  const byKey = new Map<string, { names: string[]; mine: boolean }>();
  for (const request of requests) {
    const entry = byKey.get(key(request.mediaType, request.tmdbId)) ?? { names: [], mine: false };
    entry.names.push(request.name);
    entry.mine ||= request.userId === viewerId;
    byKey.set(key(request.mediaType, request.tmdbId), entry);
  }

  for (const item of items) {
    if (item.tmdbId === undefined) continue;
    const entry = byKey.get(key(item.mediaType, item.tmdbId));
    if (!entry) continue;
    item.requestedBy = entry.names;
    item.requestedByMe = entry.mine;
  }
}
