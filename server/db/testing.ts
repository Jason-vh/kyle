import { eq } from "drizzle-orm";
import { db } from "./index.ts";
import {
  mediaRequests,
  movieSubscriptions,
  notifications,
  seriesSubscriptions,
  users,
} from "./schema.ts";

/**
 * Fixtures for tests that use the database rather than mock it. Every table
 * here hangs off a user, so removing the user is enough to clean up.
 */

export async function createTestUser(name = "Test User"): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({ displayName: `${name} ${crypto.randomUUID().slice(0, 8)}` })
    .returning();
  return user!.id;
}

export async function deleteTestUser(userId: string): Promise<void> {
  await db.delete(notifications).where(eq(notifications.userId, userId));
  await db.delete(movieSubscriptions).where(eq(movieSubscriptions.userId, userId));
  await db.delete(seriesSubscriptions).where(eq(seriesSubscriptions.userId, userId));
  await db.delete(mediaRequests).where(eq(mediaRequests.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
}
