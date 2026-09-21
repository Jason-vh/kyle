import { afterEach, expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { db } from "./index.ts";
import { conversations, messages, platformIdentities, users } from "./schema.ts";
import { backfillUserFromPlatformLink, createPlatformLink, resolveAppUserId } from "./users.ts";
import { createTestUser, deleteTestUser } from "./testing.ts";

const userIds: string[] = [];
const conversationIds: string[] = [];

afterEach(async () => {
  if (conversationIds.length) {
    await db.delete(conversations).where(inArray(conversations.id, conversationIds.splice(0)));
  }
  for (const id of userIds.splice(0)) await deleteTestUser(id);
});

test.each(["slack", "discord", "plex"])(
  "%s identity resolution sees links changed by another process",
  async (platform) => {
    const firstId = await createTestUser();
    const secondId = await createTestUser();
    userIds.push(firstId, secondId);
    const platformUserId = crypto.randomUUID();
    const { link } = await createPlatformLink(firstId, platform, platformUserId);
    expect(await resolveAppUserId(platform, platformUserId)).toBe(firstId);

    await db
      .update(platformIdentities)
      .set({ userId: secondId })
      .where(eq(platformIdentities.id, link.id));
    expect(await resolveAppUserId(platform, platformUserId)).toBe(secondId);

    await db.delete(platformIdentities).where(eq(platformIdentities.id, link.id));
    expect(await resolveAppUserId(platform, platformUserId)).toBeNull();
  },
);

test("backfills conversations and messages only on the linked platform", async () => {
  const userId = await createTestUser();
  userIds.push(userId);
  const platformUserId = crypto.randomUUID();
  const rows = await db
    .insert(conversations)
    .values([
      { interfaceType: "slack", platformUserId },
      { interfaceType: "discord", platformUserId },
    ])
    .returning();
  conversationIds.push(...rows.map((row) => row.id));
  await db.insert(messages).values(
    rows.map((row) => ({
      conversationId: row.id,
      platformUserId,
      role: "user",
      data: { role: "user", content: "hello" },
    })),
  );

  expect(await backfillUserFromPlatformLink(userId, "slack", platformUserId)).toEqual({
    conversations: 1,
    messages: 1,
    mediaEvents: 0,
  });
  const stored = await db
    .select()
    .from(conversations)
    .where(inArray(conversations.id, conversationIds));
  expect(stored.find((row) => row.interfaceType === "slack")?.userId).toBe(userId);
  expect(stored.find((row) => row.interfaceType === "discord")?.userId).toBeNull();
  expect(await backfillUserFromPlatformLink(userId, "slack", platformUserId)).toEqual({
    conversations: 0,
    messages: 0,
    mediaEvents: 0,
  });
});

test("does not disguise database failures as an empty backfill", async () => {
  const platformUserId = crypto.randomUUID();
  const [row] = await db
    .insert(conversations)
    .values({ interfaceType: "slack", platformUserId })
    .returning();
  conversationIds.push(row!.id);
  const missingUserId = crypto.randomUUID();
  expect(await db.select().from(users).where(eq(users.id, missingUserId))).toHaveLength(0);
  await expect(
    backfillUserFromPlatformLink(missingUserId, "slack", platformUserId),
  ).rejects.toThrow();
});
