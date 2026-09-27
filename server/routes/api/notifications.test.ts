import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { handleGetNotifications, handleMarkNotificationsRead } from "./notifications.ts";
import { buildJwtCookie, signJwt } from "#server/auth/jwt.ts";
import { db } from "#server/db/index.ts";
import { notifications, tmdbArtwork } from "#server/db/schema.ts";
import { createTestUser, deleteTestUser } from "#server/db/testing.ts";
import type { NotificationsResponse } from "#shared/types.ts";
import { invalidateLibraryIndex } from "#server/requests/library.ts";

process.env.JWT_SECRET = "test-secret-that-is-long-enough-for-hs256";

const realFetch = globalThis.fetch;
const SERVICES = {
  TMDB_API_TOKEN: "test-only",
  RADARR_HOST: "http://radarr.test",
  RADARR_API_KEY: "k",
  SONARR_HOST: "http://sonarr.test",
  SONARR_API_KEY: "k",
};
const previous = Object.fromEntries(Object.keys(SERVICES).map((name) => [name, process.env[name]]));

let userId = "";
let otherId = "";
let asUser = "";

beforeAll(async () => {
  for (const [name, value] of Object.entries(SERVICES)) process.env[name] = value;
  globalThis.fetch = (async (url: string) => {
    if (url.endsWith("/movie/27205")) {
      return Response.json({ poster_path: "/inception.jpg", backdrop_path: null });
    }
    if (url.endsWith("/tv/95396")) {
      return Response.json({ poster_path: "/severance.jpg", backdrop_path: null });
    }
    if (url.includes("sonarr.test") && url.includes("/series")) {
      return Response.json([{ id: 9, tmdbId: 95396, title: "Severance", seasons: [] }]);
    }
    if (url.includes("radarr.test") || url.includes("sonarr.test")) return Response.json([]);
    return Response.json({ status_message: "not found" }, { status: 404 });
  }) as unknown as typeof fetch;
  invalidateLibraryIndex();
  await db.delete(tmdbArtwork);
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
  globalThis.fetch = realFetch;
  for (const [name, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  invalidateLibraryIndex();
  await db.delete(tmdbArtwork);
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
  test("carries the title's poster when the library has it", async () => {
    await db.insert(notifications).values([
      {
        userId,
        mediaType: "movie",
        tmdbId: 27205,
        title: "Inception (2010)",
        body: "It is ready to watch.",
      },
      { userId, mediaType: "movie", tmdbId: 1, title: "Gone (2012)", body: "It is gone." },
    ]);

    const response = (await (await listed(asUser)).json()) as NotificationsResponse;

    const byTitle = new Map(response.notifications.map((item) => [item.title, item]));
    expect(byTitle.get("Inception (2010)")).toMatchObject({
      tmdbId: 27205,
      posterUrl: "https://image.tmdb.org/t/p/w342/inception.jpg",
    });
    expect(byTitle.get("Gone (2012)")?.posterUrl).toBeUndefined();
  });

  test("finds the TMDB id of a series notification Sonarr only gave its own id for", async () => {
    await db.insert(notifications).values({
      userId,
      mediaType: "series",
      serviceId: 9,
      title: "Severance (2022)",
      body: "S02E01 is ready to watch.",
    });

    const response = (await (await listed(asUser)).json()) as NotificationsResponse;

    expect(response.notifications[0]).toMatchObject({
      tmdbId: 95396,
      posterUrl: "https://image.tmdb.org/t/p/w342/severance.jpg",
    });
  });

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

  test("invalid ids reject the entire update without marking anything read", async () => {
    const first = await give(userId, "One");
    await give(userId, "Two");

    expect((await read(asUser, JSON.stringify({ ids: [first, 7, null] }))).status).toBe(400);

    const body = (await (await listed(asUser)).json()) as { unread: number };
    expect(body.unread).toBe(2);
  });

  test.each(['{"ids":[]}', '{"ids":["invalid-uuid"]}', "null", "[]", "not json"])(
    "invalid or empty selections never mark all notifications read: %s",
    async (input) => {
      await give(userId, "Unread");
      await read(asUser, input);
      expect(await (await listed(asUser)).json()).toMatchObject({ unread: 1 });
    },
  );

  // Naming a stranger's notification must not mark it read.
  test("someone else's notification is left alone", async () => {
    const theirs = await give(otherId, "Not yours");

    await read(asUser, JSON.stringify({ ids: [theirs] }));

    const [row] = await db.select().from(notifications).where(eq(notifications.id, theirs));
    expect(row?.readAt).toBeNull();
  });
});
