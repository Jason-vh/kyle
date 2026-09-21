import { eq, and, sql } from "drizzle-orm";
import { createLogger } from "#server/logger.ts";
import { db, query } from "./index.ts";
import { users, platformIdentities, plexAccountOwners, userCredentials } from "./schema.ts";

const log = createLogger("db-users");

/**
 * Resolve a platform identity to an app user UUID.
 * Returns null if no link exists.
 */
export async function resolveAppUserId(
  platform: string,
  platformUserId: string,
): Promise<string | null> {
  const row = await db.query.platformIdentities.findFirst({
    where: and(
      eq(platformIdentities.platform, platform),
      eq(platformIdentities.platformUserId, platformUserId),
    ),
  });

  return row?.userId ?? null;
}

export async function getPreviousPlexUser(plexAccountId: string) {
  const owner = await db.query.plexAccountOwners.findFirst({
    where: eq(plexAccountOwners.plexAccountId, plexAccountId),
  });
  return owner ? getUserById(owner.userId) : undefined;
}

/**
 * Map platform to interface type for scoped backfill queries.
 */
function platformToInterfaceType(platform: string): string {
  if (platform === "slack") return "slack";
  if (platform === "discord") return "discord";
  return platform;
}

/**
 * Backfill userId on existing conversations, messages, and media_refs
 * for a newly linked platform identity.
 */
export async function backfillUserFromPlatformLink(
  appUserId: string,
  platform: string,
  platformUserId: string,
): Promise<{ conversations: number; messages: number; mediaEvents: number }> {
  const interfaceType = platformToInterfaceType(platform);

  const [convResult] = await query<{ count: string }>(sql`
    WITH updated AS (
      UPDATE conversations
      SET user_id = ${appUserId}
      WHERE platform_user_id = ${platformUserId}
        AND interface_type = ${interfaceType}
        AND user_id IS NULL
      RETURNING 1
    )
    SELECT count(*)::text AS count FROM updated
  `);

  // For messages/media_events, scope by conversations of the right interface type
  const [msgResult] = await query<{ count: string }>(sql`
    WITH updated AS (
      UPDATE messages
      SET user_id = ${appUserId}
      WHERE platform_user_id = ${platformUserId}
        AND user_id IS NULL
        AND conversation_id IN (
          SELECT id FROM conversations WHERE interface_type = ${interfaceType}
        )
      RETURNING 1
    )
    SELECT count(*)::text AS count FROM updated
  `);

  const [refResult] = await query<{ count: string }>(sql`
    WITH updated AS (
      UPDATE media_events
      SET user_id = ${appUserId}
      WHERE platform_user_id = ${platformUserId}
        AND user_id IS NULL
        AND conversation_id IN (
          SELECT id FROM conversations WHERE interface_type = ${interfaceType}
        )
      RETURNING 1
    )
    SELECT count(*)::text AS count FROM updated
  `);

  const counts = {
    conversations: parseInt(convResult?.count ?? "0", 10),
    messages: parseInt(msgResult?.count ?? "0", 10),
    mediaEvents: parseInt(refResult?.count ?? "0", 10),
  };

  log.info("backfill complete", { appUserId, platform, platformUserId, ...counts });
  return counts;
}

/**
 * Get a user by ID.
 */
export async function getUserById(id: string) {
  return db.query.users.findFirst({
    where: eq(users.id, id),
  });
}

/**
 * Get a user's credentials.
 */
export async function getUserCredentials(userId: string) {
  return db.select().from(userCredentials).where(eq(userCredentials.userId, userId));
}

/**
 * Get a credential by credentialId.
 */
export async function getCredentialById(credentialId: string) {
  return db.query.userCredentials.findFirst({
    where: eq(userCredentials.credentialId, credentialId),
  });
}

/**
 * Get a user's identity on one platform, if linked.
 */
export async function getPlatformIdentity(userId: string, platform: string) {
  return db.query.platformIdentities.findFirst({
    where: and(eq(platformIdentities.userId, userId), eq(platformIdentities.platform, platform)),
  });
}

/** Whoever can act on a blocked download, so a report reaches someone. */
export async function getAdminUserIds(): Promise<string[]> {
  const rows = await db.select({ id: users.id }).from(users).where(eq(users.isAdmin, true));
  return rows.map((row) => row.id);
}

/**
 * Get all users with their platform identities.
 */
export async function getAllUsersWithIdentities() {
  const allUsers = await db.select().from(users);
  const allIdentities = await db.select().from(platformIdentities);

  return allUsers.map((u) => ({
    ...u,
    platformIdentities: allIdentities.filter((pi) => pi.userId === u.id),
  }));
}

/**
 * Create a platform identity link and trigger backfill.
 */
export async function createPlatformLink(
  userId: string,
  platform: string,
  platformUserId: string,
  platformUsername?: string,
) {
  const link = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(platformIdentities)
      .values({ userId, platform, platformUserId, platformUsername })
      .returning();
    if (platform === "plex") {
      await tx
        .insert(plexAccountOwners)
        .values({ plexAccountId: platformUserId, userId })
        .onConflictDoUpdate({ target: plexAccountOwners.plexAccountId, set: { userId } });
    }
    return created!;
  });

  const counts = await backfillUserFromPlatformLink(userId, platform, platformUserId);

  return { link: link!, counts };
}

/**
 * Create a user and their first platform identity together, so a failure
 * cannot leave a user with no way to sign in.
 */
export async function createUserWithPlatformLink(input: {
  displayName: string;
  isAdmin: boolean;
  platform: string;
  platformUserId: string;
  platformUsername?: string;
}) {
  const user = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(users)
      .values({
        displayName: input.displayName,
        isAdmin: input.isAdmin,
        plexAccountId: input.platform === "plex" ? input.platformUserId : null,
      })
      .returning();

    await tx.insert(platformIdentities).values({
      userId: created!.id,
      platform: input.platform,
      platformUserId: input.platformUserId,
      platformUsername: input.platformUsername,
    });

    if (input.platform === "plex") {
      await tx
        .insert(plexAccountOwners)
        .values({ plexAccountId: input.platformUserId, userId: created!.id })
        .onConflictDoUpdate({
          target: plexAccountOwners.plexAccountId,
          set: { userId: created!.id },
        });
    }
    return created!;
  });

  log.info("user created from platform identity", {
    userId: user.id,
    displayName: user.displayName,
    platform: input.platform,
  });

  return user;
}

/**
 * Delete a platform identity link.
 */
export async function deletePlatformLink(linkId: string) {
  const [link] = await db
    .delete(platformIdentities)
    .where(eq(platformIdentities.id, linkId))
    .returning();

  return link;
}
