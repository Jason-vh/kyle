import { and, desc, eq, inArray, sql } from "drizzle-orm";
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
  /** Which season was asked for; absent is the series as a whole. */
  seasonNumber?: number;
}

/**
 * Record a request. Requesting the same thing twice is not an error; the
 * existing row is refreshed so the service id stays current. A season and the
 * series it belongs to are separate requests, so each has its own scope to
 * conflict on.
 */
export async function saveMediaRequest(input: NewMediaRequest) {
  const wholeSeries = input.seasonNumber === undefined;
  const target = wholeSeries
    ? [mediaRequests.userId, mediaRequests.mediaType, mediaRequests.tmdbId]
    : [
        mediaRequests.userId,
        mediaRequests.mediaType,
        mediaRequests.tmdbId,
        mediaRequests.seasonNumber,
      ];

  const [row] = await db
    .insert(mediaRequests)
    .values(input)
    .onConflictDoUpdate({
      target,
      targetWhere: wholeSeries ? sql`season_number IS NULL` : sql`season_number IS NOT NULL`,
      set: { serviceId: input.serviceId ?? null, title: input.title },
    })
    .returning();

  return row!;
}

/** Give up a season: whoever asked for it no longer owns it. */
export async function deleteSeasonRequests(tmdbId: number, seasonNumber: number): Promise<void> {
  await db
    .delete(mediaRequests)
    .where(
      and(
        eq(mediaRequests.mediaType, "series"),
        eq(mediaRequests.tmdbId, tmdbId),
        eq(mediaRequests.seasonNumber, seasonNumber),
      ),
    );
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
      seasonNumber: mediaRequests.seasonNumber,
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
      plexAccountId: users.plexAccountId,
    })
    .from(mediaRequests)
    .innerJoin(users, eq(mediaRequests.userId, users.id));
}

/**
 * Who requested one title, named and identified so the viewer can be found
 * among them. Season rows carry their season, since ownership of a series is
 * the sum of ownership of its seasons.
 */
export async function getRequestersForMedia(mediaType: "movie" | "series", tmdbId: number) {
  return db
    .select({
      userId: mediaRequests.userId,
      name: users.displayName,
      seasonNumber: mediaRequests.seasonNumber,
    })
    .from(mediaRequests)
    .innerJoin(users, eq(mediaRequests.userId, users.id))
    .where(and(eq(mediaRequests.mediaType, mediaType), eq(mediaRequests.tmdbId, tmdbId)));
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
