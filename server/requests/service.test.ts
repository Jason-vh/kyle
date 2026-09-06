import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { MediaNotFoundError, requestMovie, requestSeries } from "./service.ts";
import { db } from "#server/db/index.ts";
import { createTestUser, deleteTestUser } from "#server/db/testing.ts";
import { conversations, mediaRequests, movieSubscriptions } from "#server/db/schema.ts";

// Writes go to the real database. What is worth checking here is what ends up
// in it — including an upsert a mock could not exercise at all.

process.env.RADARR_HOST = "http://radarr.test";
process.env.RADARR_API_KEY = "k";
process.env.SONARR_HOST = "http://sonarr.test";
process.env.SONARR_API_KEY = "k";

const realFetch = globalThis.fetch;

/** Stands in for Radarr and Sonarr, which are addressed by path. */
function stubServices(handlers: Record<string, unknown>) {
  const calls: { url: string; method: string }[] = [];
  globalThis.fetch = ((url: string, init: RequestInit = {}) => {
    calls.push({ url, method: init.method ?? "GET" });
    for (const [fragment, body] of Object.entries(handlers)) {
      if (url.includes(fragment)) return Promise.resolve(Response.json(body));
    }
    return Promise.resolve(new Response("unexpected", { status: 500 }));
  }) as unknown as typeof fetch;
  return calls;
}

let userId = "";
let conversationId = "";

beforeAll(async () => {
  userId = await createTestUser("Requests");
  const [conversation] = await db
    .insert(conversations)
    .values({ interfaceType: "slack", metadata: { channel: "C1", threadTs: "1.1" } })
    .returning();
  conversationId = conversation!.id;
});

afterEach(async () => {
  globalThis.fetch = realFetch;
  await db.delete(mediaRequests).where(eq(mediaRequests.userId, userId));
  await db.delete(movieSubscriptions).where(eq(movieSubscriptions.userId, userId));
});

afterAll(async () => {
  await deleteTestUser(userId);
  await db.delete(conversations).where(eq(conversations.id, conversationId));
});

const HELD = { "/movie?tmdbId=": [{ title: "Arrival", year: 2016, id: 42 }] };

describe("requestMovie", () => {
  test("adds a movie that is not in the library", async () => {
    const calls = stubServices({
      "/movie?tmdbId=": [],
      "/movie/lookup/tmdb": { title: "Arrival", year: 2016, id: null },
      "/qualityprofile": [{ id: 1 }],
      "/rootfolder": [{ path: "/movies" }],
      "/api/v3/movie": { title: "Arrival", year: 2016, id: 77 },
    });

    const { status, movie } = await requestMovie({ tmdbId: 329865 });

    expect(status).toBe("added");
    expect(movie.id).toBe(77);
    expect(calls.some((c) => c.method === "POST")).toBe(true);
  });

  // Radarr's lookup reports no id for a movie it already holds, and rejects a
  // second add with "This movie has already been added", so membership has to
  // come from the library itself.
  test("recognises a movie already in the library without adding it", async () => {
    const calls = stubServices({ ...HELD, "/movie/lookup/tmdb": { title: "Arrival", id: null } });

    const { status, movie } = await requestMovie({ tmdbId: 329865 });

    expect(status).toBe("existing");
    expect(movie.id).toBe(42);
    expect(calls.every((c) => c.method === "GET")).toBe(true);
  });

  test("records who asked for it and subscribes them", async () => {
    stubServices(HELD);

    await requestMovie({
      tmdbId: 329865,
      posterPath: "/p.jpg",
      requestedBy: { userId, conversationId },
    });

    const [request] = await db.select().from(mediaRequests).where(eq(mediaRequests.userId, userId));
    expect(request).toMatchObject({
      mediaType: "movie",
      tmdbId: 329865,
      title: "Arrival",
      year: 2016,
      posterPath: "/p.jpg",
      serviceId: 42,
    });

    const [subscription] = await db
      .select()
      .from(movieSubscriptions)
      .where(eq(movieSubscriptions.userId, userId));
    expect(subscription).toMatchObject({ radarrId: 42, conversationId, active: true });
  });

  test("records nothing when nobody can be attributed", async () => {
    stubServices(HELD);

    await requestMovie({ tmdbId: 329865 });

    expect(await db.select().from(mediaRequests).where(eq(mediaRequests.userId, userId))).toEqual(
      [],
    );
  });

  test("reports a TMDB id Radarr cannot resolve", () => {
    stubServices({ "/movie?tmdbId=": [], "/movie/lookup/tmdb": {} });

    expect(requestMovie({ tmdbId: 1 })).rejects.toThrow(MediaNotFoundError);
  });
});

describe("asking twice", () => {
  const request = (requestedBy: { userId: string; conversationId?: string }) => {
    stubServices(HELD);
    return requestMovie({ tmdbId: 329865, requestedBy });
  };

  test("does not duplicate the request or the subscription", async () => {
    await request({ userId, conversationId });
    await request({ userId, conversationId });

    expect(
      await db.select().from(mediaRequests).where(eq(mediaRequests.userId, userId)),
    ).toHaveLength(1);
    expect(
      await db.select().from(movieSubscriptions).where(eq(movieSubscriptions.userId, userId)),
    ).toHaveLength(1);
  });

  // The point of the COALESCE in the upsert: asking again from a browser must
  // not erase the thread a chat request is waiting to be answered in.
  test("a browser request keeps the conversation an earlier chat request left", async () => {
    await request({ userId, conversationId });
    await request({ userId });

    const [subscription] = await db
      .select()
      .from(movieSubscriptions)
      .where(eq(movieSubscriptions.userId, userId));
    expect(subscription?.conversationId).toBe(conversationId);
  });

  test("a chat request gives a browser-only subscription somewhere to answer", async () => {
    await request({ userId });
    await request({ userId, conversationId });

    const [subscription] = await db
      .select()
      .from(movieSubscriptions)
      .where(eq(movieSubscriptions.userId, userId));
    expect(subscription?.conversationId).toBe(conversationId);
  });

  test("re-activates a subscription that had been turned off", async () => {
    await request({ userId, conversationId });
    await db
      .update(movieSubscriptions)
      .set({ active: false })
      .where(eq(movieSubscriptions.userId, userId));

    await request({ userId, conversationId });

    const [subscription] = await db
      .select()
      .from(movieSubscriptions)
      .where(and(eq(movieSubscriptions.userId, userId), eq(movieSubscriptions.active, true)));
    expect(subscription).toBeDefined();
  });
});

describe("requestSeries", () => {
  test("resolves a series through Sonarr's own TMDB lookup", async () => {
    const calls = stubServices({
      "/series/lookup": [{ title: "Severance", year: 2022, tvdbId: 371980, id: null }],
      "/qualityprofile": [{ id: 1 }],
      "/rootfolder": [{ path: "/tv" }],
      "/api/v3/series": { title: "Severance", year: 2022, id: 9, tmdbId: 95396 },
    });

    const { status, series } = await requestSeries({ tmdbId: 95396 });

    expect(status).toBe("added");
    expect(series.id).toBe(9);
    expect(calls[0]!.url).toContain("term=tmdb%3A95396");
  });

  // The agent searches Sonarr, which is TVDB-native, so it identifies a series
  // that way; the TMDB id to record against comes back off the series itself.
  test("resolves a series by TVDB id", async () => {
    const calls = stubServices({
      "/series/lookup": [{ title: "Severance", year: 2022, tvdbId: 371980, id: 9 }],
      "/api/v3/series/9": { title: "Severance", year: 2022, id: 9, tmdbId: 95396 },
    });

    await requestSeries({ tvdbId: 371980, requestedBy: { userId } });

    expect(calls[0]!.url).toContain("term=tvdb%3A371980");
    const [request] = await db.select().from(mediaRequests).where(eq(mediaRequests.userId, userId));
    expect(request).toMatchObject({ tmdbId: 95396, serviceId: 9 });
  });

  test("reports a TMDB id Sonarr cannot resolve", () => {
    stubServices({ "/series/lookup": [] });

    expect(requestSeries({ tmdbId: 1 })).rejects.toThrow(MediaNotFoundError);
  });
});
