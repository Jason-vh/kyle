import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { handleGetNotifications, handleMarkNotificationsRead } from "./notifications.ts";
import { buildJwtCookie, signJwt } from "#server/auth/jwt.ts";
import { db } from "#server/db/index.ts";
import { notifications } from "#server/db/schema.ts";
import { createTestUser, deleteTestUser } from "#server/db/testing.ts";

process.env.JWT_SECRET = "test-secret-that-is-long-enough-for-hs256";

let userId = "";
let otherId = "";
let asUser = "";

beforeAll(async () => {
  userId = await createTestUser("Notifications");
  otherId = await createTestUser("Someone Else");
  asUser = buildJwtCookie(await signJwt({ id: userId, name: "Jane", admin: false }), true).split(
    ";",
  )[0]!;
});

afterEach(async () => {
  await db.delete(notifications).where(eq(notifications.userId, userId));
  await db.delete(notifications).where(eq(notifications.userId, otherId));
});

afterAll(async () => {
  await deleteTestUser(userId);
  await deleteTestUser(otherId);
});

async function give(owner: string, title: string): Promise<string> {
  const [row] = await db
    .insert(notifications)
    .values({ userId: owner, mediaType: "movie", title, body: "It is ready to watch." })
    .returning();
  return row!.id;
}

function request(path: string, method: string, cookie?: string, body?: string): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: cookie ? { Cookie: cookie, "Content-Type": "application/json" } : {},
    body,
  });
}

const listed = (cookie?: string) =>
  handleGetNotifications(request("/api/notifications", "GET", cookie));
const read = (cookie?: string, body?: string) =>
  handleMarkNotificationsRead(request("/api/notifications/read", "POST", cookie, body));

describe("GET /api/notifications", () => {
  test("a signed-out visitor is refused", async () => {
    expect((await listed()).status).toBe(401);
  });

  test("reports what there is and how much is unread", async () => {
    await give(userId, "Inception (2010)");

    const body = (await (await listed(asUser)).json()) as {
      notifications: { title: string }[];
      unread: number;
    };

    expect(body.notifications.map((n) => n.title)).toEqual(["Inception (2010)"]);
    expect(body.unread).toBe(1);
  });

  test("shows nobody else's", async () => {
    await give(otherId, "Not yours");

    const body = (await (await listed(asUser)).json()) as { notifications: unknown[] };
    expect(body.notifications).toEqual([]);
  });
});

describe("POST /api/notifications/read", () => {
  test("a signed-out visitor is refused", async () => {
    expect((await read()).status).toBe(401);
  });

  // The bell has no per-item control, so an empty body means all of them.
  test("an empty body marks everything read", async () => {
    await give(userId, "One");
    await give(userId, "Two");

    expect((await (await read(asUser, "{}")).json()) as { read: number }).toEqual({ read: 2 });

    const body = (await (await listed(asUser)).json()) as { unread: number };
    expect(body.unread).toBe(0);
  });

  test("named ids mark only those", async () => {
    const first = await give(userId, "One");
    await give(userId, "Two");

    await read(asUser, JSON.stringify({ ids: [first] }));

    const body = (await (await listed(asUser)).json()) as { unread: number };
    expect(body.unread).toBe(1);
  });

  test("ids that are not strings are dropped rather than reaching the query", async () => {
    const first = await give(userId, "One");
    await give(userId, "Two");

    await read(asUser, JSON.stringify({ ids: [first, 7, null] }));

    const body = (await (await listed(asUser)).json()) as { unread: number };
    expect(body.unread).toBe(1);
  });

  // Naming a stranger's notification must not mark it read.
  test("someone else's notification is left alone", async () => {
    const theirs = await give(otherId, "Not yours");

    await read(asUser, JSON.stringify({ ids: [theirs] }));

    const [row] = await db.select().from(notifications).where(eq(notifications.id, theirs));
    expect(row?.readAt).toBeNull();
  });
});
