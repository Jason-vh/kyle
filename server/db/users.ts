import { eq, and, sql } from "drizzle-orm";
import { createLogger } from "../logger.ts";
import { db } from "./index.ts";
import { users, platformIdentities, userCredentials } from "./schema.ts";

const log = createLogger("db-users");

// In-memory cache: "platform:platformUserId" → app user UUID
const platformCache = new Map<string, string>();

function cacheKey(platform: string, platformUserId: string): string {
  return `${platform}:${platformUserId}`;
}

/**
 * Resolve a platform identity to an app user UUID.
 * Returns null if no link exists.
 */
export async function resolveAppUserId(
  platform: string,
  platformUserId: string,
): Promise<string | null> {
  const key = cacheKey(platform, platformUserId);
  const cached = platformCache.get(key);
  if (cached !== undefined) return cached;

  const row = await db.query.platformIdentities.findFirst({
    where: and(
      eq(platformIdentities.platform, platform),
      eq(platformIdentities.platformUserId, platformUserId),
    ),
  });

  if (row) {
    platformCache.set(key, row.userId);
    return row.userId;
  }

  return null;
}

/**
 * Invalidate the platform identity cache for a specific link.
 */
export function invalidatePlatformCache(platform: string, platformUserId: string): void {
  platformCache.delete(cacheKey(platform, platformUserId));
}

/**
 * Invalidate the entire platform identity cache.
 */
export function invalidateAllPlatformCache(): void {
  platformCache.clear();
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
): Promise<{ conversations: number; messages: number; mediaRefs: number }> {
  const interfaceType = platformToInterfaceType(platform);

  const [convResult] = await db
    .execute<{ count: string }>(sql`
    UPDATE conversations
    SET user_id = ${appUserId}
    WHERE platform_user_id = ${platformUserId}
      AND interface_type = ${interfaceType}
      AND user_id IS NULL
    RETURNING count(*)::text AS count
  `)
    .catch(() => [{ count: "0" }]);

  // For messages/media_refs, scope by conversations of the right interface type
  const [msgResult] = await db
    .execute<{ count: string }>(sql`
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
  `)
    .catch(() => [{ count: "0" }]);

  const [refResult] = await db
    .execute<{ count: string }>(sql`
    WITH updated AS (
      UPDATE media_refs
      SET user_id = ${appUserId}
      WHERE platform_user_id = ${platformUserId}
        AND user_id IS NULL
        AND conversation_id IN (
          SELECT id FROM conversations WHERE interface_type = ${interfaceType}
        )
      RETURNING 1
    )
    SELECT count(*)::text AS count FROM updated
  `)
    .catch(() => [{ count: "0" }]);

  const counts = {
    conversations: parseInt(convResult?.count ?? "0", 10),
    messages: parseInt(msgResult?.count ?? "0", 10),
    mediaRefs: parseInt(refResult?.count ?? "0", 10),
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
  const [link] = await db
    .insert(platformIdentities)
    .values({ userId, platform, platformUserId, platformUsername })
    .returning();

  // Cache the new link
  platformCache.set(cacheKey(platform, platformUserId), userId);

  // Run backfill
  const counts = await backfillUserFromPlatformLink(userId, platform, platformUserId);

  return { link: link!, counts };
}

/**
 * Delete a platform identity link.
 */
export async function deletePlatformLink(linkId: string) {
  const [link] = await db
    .delete(platformIdentities)
    .where(eq(platformIdentities.id, linkId))
    .returning();

  if (link) {
    invalidatePlatformCache(link.platform, link.platformUserId);
  }

  return link;
}
