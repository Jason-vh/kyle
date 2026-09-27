import { afterEach, describe, expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { db, query } from "./index.ts";
import { sql } from "drizzle-orm";
import {
  authSessions,
  conversations,
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
import {
  deleteEmptyUser,
  footprintOf,
  MergeRefusedError,
  mergeUsers,
  USER_REFERENCES,
} from "./merge.ts";
import { createTestUser } from "./testing.ts";

const userIds: string[] = [];
const conversationIds: string[] = [];

afterEach(async () => {
  const ids = userIds.splice(0);
  if (conversationIds.length) {
    await db.delete(conversations).where(inArray(conversations.id, conversationIds.splice(0)));
  }
  if (ids.length === 0) return;
  await db.delete(notifications).where(inArray(notifications.userId, ids));
  await db.delete(movieSubscriptions).where(inArray(movieSubscriptions.userId, ids));
  await db.delete(seriesSubscriptions).where(inArray(seriesSubscriptions.userId, ids));
  await db.delete(mediaRemovals).where(inArray(mediaRemovals.removedByUserId, ids));
  await db.delete(users).where(inArray(users.id, ids));
});

async function user(name = "Merge"): Promise<string> {
  const id = await createTestUser(name);
  userIds.push(id);
  return id;
}

/** One of everything a user can own. */
async function populate(userId: string): Promise<void> {
  const tag = crypto.randomUUID();
  await db.insert(platformIdentities).values({ userId, platform: "slack", platformUserId: tag });
  await db.insert(plexAccountOwners).values({ plexAccountId: tag, userId });
  await db.insert(userCredentials).values({
    userId,
    credentialId: tag,
    publicKey: new Uint8Array([1]),
    counter: 0,
  });
  await db.insert(mediaRequests).values({ userId, mediaType: "movie", tmdbId: 1, title: "Heat" });
  const [conversation] = await db
    .insert(conversations)
    .values({ userId, interfaceType: "web", externalId: tag })
    .returning();
  conversationIds.push(conversation!.id);
  const [message] = await db
    .insert(messages)
    .values({ userId, conversationId: conversation!.id, role: "user", data: {} })
    .returning();
  await db.insert(mediaEvents).values({
    userId,
    conversationId: conversation!.id,
    messageId: message!.id,
    toolCallId: tag,
    mediaType: "movie",
    title: "Heat",
    action: "added",
    ids: {},
  });
  await db.insert(movieSubscriptions).values({ userId, radarrId: 1 });
  await db.insert(seriesSubscriptions).values({ userId, sonarrId: 1 });
  await db.insert(notifications).values({ userId, mediaType: "movie", title: "Heat", body: "x" });
  await db.insert(plexInvites).values({ invitedByUserId: userId, email: `${tag}@example.com` });
  await db.insert(mediaRemovals).values({
    mediaType: "movie",
    tmdbId: Math.floor(Math.random() * 1e9),
    title: "Heat",
    removedByUserId: userId,
  });
  await db.insert(authSessions).values({
    id: crypto.randomUUID(),
    userId,
    expiresAt: new Date(Date.now() + 60_000),
  });
}

describe("mergeUsers", () => {
  test("handles every column that points at a user", async () => {
    const rows = await query<{ reference: string }>(sql`
      SELECT cl.relname || '.' || att.attname AS reference
      FROM pg_constraint con
      JOIN pg_class cl ON cl.oid = con.conrelid
      JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
      WHERE con.contype = 'f' AND con.confrelid = 'users'::regclass
    `);

    expect(rows.length).toBeGreaterThan(10);
    for (const { reference } of rows) expect(USER_REFERENCES).toContain(reference);
  });

  test("moves everything to the kept user and deletes the other", async () => {
    const gone = await user("Gone");
    const kept = await user("Kept");
    await populate(gone);
    const before = await footprintOf(gone);

    await mergeUsers(gone, kept, "Jordan");

    expect(await footprintOf(kept)).toEqual(before);
    expect(await db.select().from(users).where(eq(users.id, gone))).toEqual([]);
    const [survivor] = await db.select().from(users).where(eq(users.id, kept));
    expect(survivor?.displayName).toBe("Jordan");
  });

  test("keeps one of anything both users had, with the earlier request date", async () => {
    const gone = await user();
    const kept = await user();
    const early = new Date("2026-01-01T00:00:00Z");
    await db.insert(mediaRequests).values([
      { userId: gone, mediaType: "movie", tmdbId: 7, title: "Heat", createdAt: early },
      { userId: kept, mediaType: "movie", tmdbId: 7, title: "Heat" },
    ]);
    await db.insert(movieSubscriptions).values([
      { userId: gone, radarrId: 7, active: true },
      { userId: kept, radarrId: 7, active: false },
    ]);

    await mergeUsers(gone, kept, "Kept");

    const requests = await db.select().from(mediaRequests).where(eq(mediaRequests.userId, kept));
    expect(requests).toHaveLength(1);
    expect(requests[0]?.createdAt).toEqual(early);
    const subscriptions = await db
      .select()
      .from(movieSubscriptions)
      .where(eq(movieSubscriptions.userId, kept));
    expect(subscriptions.map((row) => row.active)).toEqual([true]);
  });

  test("keeps admin rights from either side", async () => {
    const gone = await user();
    const kept = await user();
    await db.update(users).set({ isAdmin: true }).where(eq(users.id, gone));

    await mergeUsers(gone, kept, "Kept");

    const [survivor] = await db.select().from(users).where(eq(users.id, kept));
    expect(survivor?.isAdmin).toBe(true);
  });

  test("refuses to join two Plex accounts", async () => {
    const gone = await user();
    const kept = await user();
    await db.insert(platformIdentities).values([
      { userId: gone, platform: "plex", platformUserId: crypto.randomUUID() },
      { userId: kept, platform: "plex", platformUserId: crypto.randomUUID() },
    ]);

    await expect(mergeUsers(gone, kept, "Kept")).rejects.toThrow(MergeRefusedError);
    await db.delete(platformIdentities).where(inArray(platformIdentities.userId, [gone, kept]));
  });

  test("refuses to merge a user into themselves", async () => {
    const id = await user();
    await expect(mergeUsers(id, id, "Same")).rejects.toThrow(MergeRefusedError);
  });
});

describe("deleteEmptyUser", () => {
  test("deletes a user with nothing to their name", async () => {
    const id = await user();
    await deleteEmptyUser(id);
    expect(await db.select().from(users).where(eq(users.id, id))).toEqual([]);
  });

  test("refuses a user with history", async () => {
    const id = await user();
    await db
      .insert(mediaRequests)
      .values({ userId: id, mediaType: "movie", tmdbId: 3, title: "Up" });
    await expect(deleteEmptyUser(id)).rejects.toThrow(MergeRefusedError);
  });
});
