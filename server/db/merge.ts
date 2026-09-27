import { and, count, eq, getTableName, sql } from "drizzle-orm";
import { db } from "./index.ts";
import {
  authSessions,
  conversations,
  linkCodes,
  mediaEvents,
  mediaRemovals,
  mediaRequests,
  messages,
  movieSubscriptions,
  notifications,
  platformIdentities,
  plexAccountOwners,
  plexInvites,
  seriesSubscriptions,
  userCredentials,
  users,
} from "./schema.ts";
import { createLogger } from "#server/logger.ts";
import type { UserFootprint } from "#shared/types.ts";

const log = createLogger("db-merge");

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export class MergeRefusedError extends Error {}

export const FOOTPRINT_TABLES = {
  identities: { table: platformIdentities, column: platformIdentities.userId },
  passkeys: { table: userCredentials, column: userCredentials.userId },
  requests: { table: mediaRequests, column: mediaRequests.userId },
  conversations: { table: conversations, column: conversations.userId },
  messages: { table: messages, column: messages.userId },
  mediaEvents: { table: mediaEvents, column: mediaEvents.userId },
  movieSubscriptions: { table: movieSubscriptions, column: movieSubscriptions.userId },
  seriesSubscriptions: { table: seriesSubscriptions, column: seriesSubscriptions.userId },
  notifications: { table: notifications, column: notifications.userId },
  plexInvites: { table: plexInvites, column: plexInvites.invitedByUserId },
  removals: { table: mediaRemovals, column: mediaRemovals.removedByUserId },
  plexAccounts: { table: plexAccountOwners, column: plexAccountOwners.userId },
} as const satisfies Record<keyof UserFootprint, unknown>;

type FootprintKey = keyof UserFootprint;

const FOOTPRINT_KEYS = Object.keys(FOOTPRINT_TABLES) as FootprintKey[];

export function emptyFootprint(): UserFootprint {
  return Object.fromEntries(FOOTPRINT_KEYS.map((key) => [key, 0])) as unknown as UserFootprint;
}

export const USER_REFERENCES = [
  ...FOOTPRINT_KEYS.map((key) => {
    const { table, column } = FOOTPRINT_TABLES[key];
    return `${getTableName(table)}.${column.name}`;
  }),
  "auth_sessions.user_id",
  "link_codes.user_id",
];

/** How much of everything each user owns, for the few users a household has. */
export async function footprints(): Promise<Map<string, UserFootprint>> {
  const byUser = new Map<string, UserFootprint>();
  for (const key of FOOTPRINT_KEYS) {
    const { table, column } = FOOTPRINT_TABLES[key];
    const rows = await db.select({ userId: column, total: count() }).from(table).groupBy(column);
    for (const { userId, total } of rows) {
      if (!userId) continue;
      const footprint = byUser.get(userId) ?? emptyFootprint();
      footprint[key] = total;
      byUser.set(userId, footprint);
    }
  }
  return byUser;
}

export async function footprintOf(userId: string): Promise<UserFootprint> {
  return (await footprints()).get(userId) ?? emptyFootprint();
}

/** What a user would take with them, beyond the ways they sign in. */
export function hasHistory(footprint: UserFootprint): boolean {
  const { identities, passkeys, plexAccounts, ...history } = footprint;
  return Object.values(history).some((total) => total > 0);
}

/**
 * Where both users hold the same thing, the one being kept wins; the older
 * request date survives, so nobody's request jumps the queue by being merged.
 */
async function dropDuplicates(tx: Transaction, from: string, into: string): Promise<void> {
  await tx.execute(sql`
    UPDATE media_requests kept SET created_at = LEAST(kept.created_at, gone.created_at)
    FROM media_requests gone
    WHERE kept.user_id = ${into} AND gone.user_id = ${from}
      AND kept.media_type = gone.media_type AND kept.tmdb_id = gone.tmdb_id
      AND kept.season_number IS NOT DISTINCT FROM gone.season_number
  `);
  await tx.execute(sql`
    DELETE FROM media_requests gone USING media_requests kept
    WHERE kept.user_id = ${into} AND gone.user_id = ${from}
      AND kept.media_type = gone.media_type AND kept.tmdb_id = gone.tmdb_id
      AND kept.season_number IS NOT DISTINCT FROM gone.season_number
  `);

  await tx.execute(sql`
    UPDATE movie_subscriptions kept SET active = kept.active OR gone.active
    FROM movie_subscriptions gone
    WHERE kept.user_id = ${into} AND gone.user_id = ${from} AND kept.radarr_id = gone.radarr_id
  `);
  await tx.execute(sql`
    DELETE FROM movie_subscriptions gone USING movie_subscriptions kept
    WHERE kept.user_id = ${into} AND gone.user_id = ${from} AND kept.radarr_id = gone.radarr_id
  `);

  await tx.execute(sql`
    UPDATE series_subscriptions kept SET active = kept.active OR gone.active
    FROM series_subscriptions gone
    WHERE kept.user_id = ${into} AND gone.user_id = ${from} AND kept.sonarr_id = gone.sonarr_id
      AND kept.season_number IS NOT DISTINCT FROM gone.season_number
      AND kept.episode_number IS NOT DISTINCT FROM gone.episode_number
  `);
  await tx.execute(sql`
    DELETE FROM series_subscriptions gone USING series_subscriptions kept
    WHERE kept.user_id = ${into} AND gone.user_id = ${from} AND kept.sonarr_id = gone.sonarr_id
      AND kept.season_number IS NOT DISTINCT FROM gone.season_number
      AND kept.episode_number IS NOT DISTINCT FROM gone.episode_number
  `);

  await tx.execute(sql`
    DELETE FROM notifications gone USING notifications kept
    WHERE kept.user_id = ${into} AND gone.user_id = ${from}
      AND kept.webhook_job_id = gone.webhook_job_id
  `);
}

async function plexIdentityOf(tx: Transaction, userId: string) {
  const [identity] = await tx
    .select()
    .from(platformIdentities)
    .where(and(eq(platformIdentities.userId, userId), eq(platformIdentities.platform, "plex")));
  return identity;
}

/**
 * Fold one user into another: everything the first owns moves and the first
 * is deleted. Two Plex accounts cannot become one person, since each signs in
 * on its own.
 */
export async function mergeUsers(from: string, into: string): Promise<void> {
  if (from === into) throw new MergeRefusedError("Cannot merge a user into themselves");

  await db.transaction(async (tx) => {
    const [gone] = await tx.select().from(users).where(eq(users.id, from)).for("update");
    const [kept] = await tx.select().from(users).where(eq(users.id, into)).for("update");
    if (!gone || !kept) throw new MergeRefusedError("No such user");

    if ((await plexIdentityOf(tx, from)) && (await plexIdentityOf(tx, into))) {
      throw new MergeRefusedError("Both users have a Plex account; disconnect one first");
    }

    await dropDuplicates(tx, from, into);

    await moveEverything(tx, from, into);
    await tx.delete(authSessions).where(eq(authSessions.userId, from));
    await tx.delete(linkCodes).where(eq(linkCodes.userId, from));

    await tx
      .update(users)
      .set({ isAdmin: kept.isAdmin || gone.isAdmin, updatedAt: new Date() })
      .where(eq(users.id, into));

    await tx.delete(users).where(eq(users.id, from));
  });

  log.info("users merged", { from, into });
}

async function moveEverything(tx: Transaction, from: string, into: string): Promise<void> {
  const to = { userId: into };
  await tx.update(platformIdentities).set(to).where(eq(platformIdentities.userId, from));
  await tx.update(userCredentials).set(to).where(eq(userCredentials.userId, from));
  await tx.update(plexAccountOwners).set(to).where(eq(plexAccountOwners.userId, from));
  await tx.update(mediaRequests).set(to).where(eq(mediaRequests.userId, from));
  await tx.update(conversations).set(to).where(eq(conversations.userId, from));
  await tx.update(messages).set(to).where(eq(messages.userId, from));
  await tx.update(mediaEvents).set(to).where(eq(mediaEvents.userId, from));
  await tx.update(movieSubscriptions).set(to).where(eq(movieSubscriptions.userId, from));
  await tx.update(seriesSubscriptions).set(to).where(eq(seriesSubscriptions.userId, from));
  await tx.update(notifications).set(to).where(eq(notifications.userId, from));
  await tx
    .update(plexInvites)
    .set({ invitedByUserId: into })
    .where(eq(plexInvites.invitedByUserId, from));
  await tx
    .update(mediaRemovals)
    .set({ removedByUserId: into })
    .where(eq(mediaRemovals.removedByUserId, from));
}

/** A user with nothing to their name; anyone with history is merged instead. */
export async function deleteEmptyUser(userId: string): Promise<void> {
  if (hasHistory(await footprintOf(userId))) {
    throw new MergeRefusedError("This user has history; merge them into someone instead");
  }
  await db.delete(users).where(eq(users.id, userId));
  log.info("user deleted", { userId });
}
