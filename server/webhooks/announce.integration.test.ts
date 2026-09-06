import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { eq } from "drizzle-orm";

/**
 * The seam a browser request falls through, against a live database: a
 * subscription with no conversation to be answered in, and whether the person
 * behind it is actually told. Run `bun run db:up && bun run db:migrate` first;
 * skipped when unreachable.
 *
 * The subscription is inserted directly rather than through `requestMovie`,
 * because another suite mocks the subscription module and `mock.module` lasts
 * the whole run. That `requestMovie` writes this row is covered in
 * `server/requests/service.test.ts`.
 */
const dbReachable = await (async () => {
  if (!process.env.DATABASE_URL) return false;
  const { checkDatabaseHealth } = await import("#server/db/index.ts");
  return checkDatabaseHealth();
})();

if (!dbReachable) {
  console.warn("skipping announce integration tests: DATABASE_URL is unset or unreachable");
}

// Chat delivery needs Slack; this suite is about what reaches the app.
let chatFails = false;
const realNotify = await import("./notify.ts");
mock.module("#server/webhooks/notify.ts", () => ({
  ...realNotify,
  notifyRequesters: () =>
    chatFails ? Promise.reject(new Error("Slack is down")) : Promise.resolve(),
}));

const { announce } = await import("./announce.ts");
const { findMediaRequesters } = await import("./requester.ts");
const { db } = await import("#server/db/index.ts");
const { users, notifications, movieSubscriptions } = await import("#server/db/schema.ts");

const RADARR_ID = 424242;
const TMDB_ID = 27205;
const ARRIVED = { mediaType: "movie", title: "Inception", year: 2010 } as const;

let userId = "";

/** Read straight from the table, since the repository module may be mocked. */
async function unreadCount(): Promise<number> {
  const rows = await db.select().from(notifications).where(eq(notifications.userId, userId));
  return rows.filter((row) => row.readAt === null).length;
}

beforeAll(async () => {
  if (!dbReachable) return;

  const [user] = await db
    .insert(users)
    .values({ displayName: `Announce Test ${crypto.randomUUID().slice(0, 8)}` })
    .returning();
  userId = user!.id;

  // What a request made in a browser leaves behind: no conversation at all.
  await db.insert(movieSubscriptions).values({ userId, radarrId: RADARR_ID, conversationId: null });
});

afterAll(async () => {
  if (!userId) return;
  await db.delete(notifications).where(eq(notifications.userId, userId));
  await db.delete(movieSubscriptions).where(eq(movieSubscriptions.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
});

describe.if(dbReachable)("a request made in the browser", () => {
  test("is told when the media arrives, despite having no conversation", async () => {
    const result = await announce({ radarr: RADARR_ID, tmdb: TMDB_ID }, ARRIVED);

    expect(result).toEqual({ notified: 1, posted: 0 });

    const [row] = await db.select().from(notifications).where(eq(notifications.userId, userId));
    expect(row).toMatchObject({
      mediaType: "movie",
      title: "Inception (2010)",
      body: "It is ready to watch.",
      tmdbId: TMDB_ID,
      serviceId: RADARR_ID,
      readAt: null,
    });
  });

  // Why the app half had to exist: the chat lookup joins conversations, and
  // this subscription has none, so it finds nobody at all.
  test("is invisible to the chat lookup that used to be the only one", async () => {
    expect(await findMediaRequesters("movie", { radarr: RADARR_ID })).toEqual([]);
  });

  test("hears again when the media arrives again", async () => {
    await announce({ radarr: RADARR_ID, tmdb: TMDB_ID }, ARRIVED);
    expect(await unreadCount()).toBe(2);
  });

  // Slack being down is not a reason to lose the record of what happened.
  test("keeps the notification when the chat reply fails", async () => {
    chatFails = true;
    try {
      expect((await announce({ radarr: RADARR_ID }, ARRIVED)).notified).toBe(1);
    } finally {
      chatFails = false;
    }

    expect(await unreadCount()).toBe(3);
  });

  test("an inactive subscription hears nothing", async () => {
    await db
      .update(movieSubscriptions)
      .set({ active: false })
      .where(eq(movieSubscriptions.userId, userId));

    expect((await announce({ radarr: RADARR_ID }, ARRIVED)).notified).toBe(0);
    expect(await unreadCount()).toBe(3);
  });
});
