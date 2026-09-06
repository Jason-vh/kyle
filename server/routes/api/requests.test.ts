import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { handleCreateRequest } from "./requests.ts";
import { buildJwtCookie, signJwt } from "#server/auth/jwt.ts";
import { db } from "#server/db/index.ts";
import { mediaRequests, movieSubscriptions } from "#server/db/schema.ts";
import { createTestUser, deleteTestUser } from "#server/db/testing.ts";
import { invalidateLibraryIndex } from "#server/requests/library.ts";

// No mocks: the route runs the real write path, with Radarr and Sonarr stubbed
// at the network. What it adds up to is read back out of the database.

process.env.JWT_SECRET = "test-secret-that-is-long-enough-for-hs256";
process.env.RADARR_HOST = "http://radarr.test";
process.env.RADARR_API_KEY = "k";
process.env.SONARR_HOST = "http://sonarr.test";
process.env.SONARR_API_KEY = "k";

const realFetch = globalThis.fetch;

function stubServices(handlers: Record<string, unknown>) {
  globalThis.fetch = ((url: string) => {
    for (const [fragment, body] of Object.entries(handlers)) {
      if (url.includes(fragment)) return Promise.resolve(Response.json(body));
    }
    return Promise.resolve(new Response("unexpected", { status: 500 }));
  }) as unknown as typeof fetch;
}

/** Radarr already holds it, so a request records without adding. */
const HOLDS_INCEPTION = { "/movie?tmdbId=": [{ title: "Inception", year: 2010, id: 42 }] };

let userId = "";
let asUser = "";

beforeAll(async () => {
  userId = await createTestUser("Request Route");
  asUser = buildJwtCookie(await signJwt({ id: userId, name: "Jane", admin: false }), true).split(
    ";",
  )[0]!;
});

afterEach(async () => {
  globalThis.fetch = realFetch;
  invalidateLibraryIndex();
  await db.delete(movieSubscriptions).where(eq(movieSubscriptions.userId, userId));
  await db.delete(mediaRequests).where(eq(mediaRequests.userId, userId));
});

afterAll(async () => {
  await deleteTestUser(userId);
});

function post(body: unknown, cookie?: string, raw?: string): Request {
  return new Request("http://localhost/api/requests", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: raw ?? JSON.stringify(body),
  });
}

const requestsFor = () => db.select().from(mediaRequests).where(eq(mediaRequests.userId, userId));

describe("POST /api/requests", () => {
  test("a signed-out visitor is refused", async () => {
    stubServices(HOLDS_INCEPTION);

    expect((await handleCreateRequest(post({ mediaType: "movie", tmdbId: 1 }))).status).toBe(401);
    expect(await requestsFor()).toEqual([]);
  });

  test("adds a movie for whoever asked, and subscribes them", async () => {
    stubServices(HOLDS_INCEPTION);

    const res = await handleCreateRequest(post({ mediaType: "movie", tmdbId: 27205 }, asUser));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "existing", title: "Inception", year: 2010 });
    expect(await requestsFor()).toMatchObject([
      { mediaType: "movie", tmdbId: 27205, serviceId: 42 },
    ]);

    // A browser request has nowhere to be answered, which is the whole point.
    const [subscription] = await db
      .select()
      .from(movieSubscriptions)
      .where(eq(movieSubscriptions.userId, userId));
    expect(subscription).toMatchObject({ radarrId: 42, conversationId: null, active: true });
  });

  test("a series goes to the other half of the write path", async () => {
    stubServices({
      "/series/lookup": [{ title: "Severance", year: 2022, tvdbId: 371980, id: 9 }],
      "/api/v3/series/9": { title: "Severance", year: 2022, id: 9, tmdbId: 95396 },
    });

    const res = await handleCreateRequest(post({ mediaType: "series", tmdbId: 95396 }, asUser));

    expect(await res.json()).toEqual({ status: "existing", title: "Severance", year: 2022 });
    expect(await requestsFor()).toMatchObject([{ mediaType: "series", tmdbId: 95396 }]);
  });

  // The browser sends what it already has, so the request list has art before
  // the services have anything at all.
  test("keeps the poster the browser sent", async () => {
    stubServices(HOLDS_INCEPTION);

    await handleCreateRequest(
      post({ mediaType: "movie", tmdbId: 1, posterPath: "/p.jpg" }, asUser),
    );

    expect(await requestsFor()).toMatchObject([{ posterPath: "/p.jpg" }]);
  });

  test.each([
    ["an unknown media type", { mediaType: "album", tmdbId: 1 }],
    ["a missing media type", { tmdbId: 1 }],
    ["a missing id", { mediaType: "movie" }],
    ["an id that is not a whole number", { mediaType: "movie", tmdbId: 1.5 }],
    ["an id that is not a number", { mediaType: "movie", tmdbId: "27205" }],
  ])("refuses %s before touching anything", async (_name, body) => {
    stubServices(HOLDS_INCEPTION);

    expect((await handleCreateRequest(post(body, asUser))).status).toBe(400);
    expect(await requestsFor()).toEqual([]);
  });

  test("refuses a body that is not JSON", async () => {
    expect((await handleCreateRequest(post(null, asUser, "not json"))).status).toBe(400);
  });

  test("a title neither service can resolve is a miss", async () => {
    stubServices({ "/movie?tmdbId=": [], "/movie/lookup/tmdb": {} });

    const res = await handleCreateRequest(post({ mediaType: "movie", tmdbId: 1 }, asUser));

    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toContain("No movie found");
  });

  // A trip to the server logs to learn what broke is a trip too many.
  test("an upstream failure surfaces its own message", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(new Response("no root folders", { status: 500 }))) as unknown as typeof fetch;

    const res = await handleCreateRequest(post({ mediaType: "movie", tmdbId: 1 }, asUser));

    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: string }).error).toContain("no root folders");
  });
});
