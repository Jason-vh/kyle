import type { LibraryMediaType, Person } from "#shared/types.ts";

/** A request, as the database reports it for annotating a list of media. */
export interface Requester {
  mediaType: string;
  tmdbId: number;
  userId: string;
  name: string;
  plexAccountId?: string | null;
}

/** Anything a request can be matched to: the library, the activity feed. */
export interface Attributable {
  mediaType: LibraryMediaType;
  /** Absent for media the services cannot map to TMDB, which matches nothing. */
  tmdbId?: number;
  requestedBy: Person[];
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
  avatars: Map<string, string> = new Map(),
): void {
  if (requests.length === 0) return;

  const byKey = new Map<string, Map<string, Person>>();
  for (const request of requests) {
    const people = byKey.get(key(request.mediaType, request.tmdbId)) ?? new Map<string, Person>();
    if (!people.has(request.userId)) {
      const thumb = request.plexAccountId ? avatars.get(request.plexAccountId) : undefined;
      people.set(request.userId, { name: request.name, thumb });
    }
    byKey.set(key(request.mediaType, request.tmdbId), people);
  }

  for (const item of items) {
    if (item.tmdbId === undefined) continue;
    const people = byKey.get(key(item.mediaType, item.tmdbId));
    if (!people) continue;
    item.requestedBy = [...people.values()];
    item.requestedByMe = people.has(viewerId);
  }
}
