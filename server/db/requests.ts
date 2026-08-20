import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "./index.ts";
import { mediaRequests, users } from "./schema.ts";

export interface NewMediaRequest {
  userId: string;
  mediaType: "movie" | "series";
  tmdbId: number;
  title: string;
  year?: number;
  posterPath?: string;
  serviceId?: number;
}

/**
 * Record a request. Requesting the same title twice is not an error; the
 * existing row is refreshed so the service id stays current.
 */
export async function saveMediaRequest(input: NewMediaRequest) {
  const [row] = await db
    .insert(mediaRequests)
    .values(input)
    .onConflictDoUpdate({
      target: [mediaRequests.userId, mediaRequests.mediaType, mediaRequests.tmdbId],
      set: { serviceId: input.serviceId ?? null, title: input.title },
    })
    .returning();

  return row!;
}

/** Requests made by one user, newest first. */
export async function getMediaRequestsForUser(userId: string) {
  return db
    .select()
    .from(mediaRequests)
    .where(eq(mediaRequests.userId, userId))
    .orderBy(desc(mediaRequests.createdAt));
}

/** Every request with the name of whoever made it, newest first. */
export async function getAllMediaRequests(limit = 100) {
  return db
    .select({
      id: mediaRequests.id,
      userId: mediaRequests.userId,
      requestedBy: users.displayName,
      mediaType: mediaRequests.mediaType,
      tmdbId: mediaRequests.tmdbId,
      title: mediaRequests.title,
      year: mediaRequests.year,
      posterPath: mediaRequests.posterPath,
      serviceId: mediaRequests.serviceId,
      createdAt: mediaRequests.createdAt,
    })
    .from(mediaRequests)
    .innerJoin(users, eq(mediaRequests.userId, users.id))
    .orderBy(desc(mediaRequests.createdAt))
    .limit(limit);
}

/**
 * Every request with its requester, for annotating a whole library listing.
 * A household's request table is small enough that fetching it beats filtering
 * by a few hundred ids.
 */
export async function getAllRequesters() {
  return db
    .select({
      mediaType: mediaRequests.mediaType,
      tmdbId: mediaRequests.tmdbId,
      userId: mediaRequests.userId,
      name: users.displayName,
    })
    .from(mediaRequests)
    .innerJoin(users, eq(mediaRequests.userId, users.id));
}

/** Who requested each of these titles, for showing alongside search results. */
export function requestersQuery(mediaType: "movie" | "series", tmdbIds: number[]) {
  return db
    .select({ tmdbId: mediaRequests.tmdbId, name: users.displayName })
    .from(mediaRequests)
    .innerJoin(users, eq(mediaRequests.userId, users.id))
    .where(and(eq(mediaRequests.mediaType, mediaType), inArray(mediaRequests.tmdbId, tmdbIds)));
}

export async function getRequestersByTmdbId(
  mediaType: "movie" | "series",
  tmdbIds: number[],
): Promise<Map<number, string[]>> {
  if (tmdbIds.length === 0) return new Map();

  const rows = await requestersQuery(mediaType, tmdbIds);

  const byId = new Map<number, string[]>();
  for (const row of rows) {
    byId.set(row.tmdbId, [...(byId.get(row.tmdbId) ?? []), row.name]);
  }
  return byId;
}
