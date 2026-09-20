import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import {
  MediaNotFoundError,
  releaseSeason,
  requestEpisode,
  requestMovie,
  requestSeason,
  requestSeries,
} from "./service.ts";
import { db } from "#server/db/index.ts";
import { createTestUser, deleteTestUser } from "#server/db/testing.ts";
import {
  conversations,
  mediaRequests,
  movieSubscriptions,
  seriesSubscriptions,
} from "#server/db/schema.ts";

// Writes go to the real database. What is worth checking here is what ends up
// in it — including an upsert a mock could not exercise at all.

process.env.RADARR_HOST = "http://radarr.test";
process.env.RADARR_API_KEY = "k";
process.env.SONARR_HOST = "http://sonarr.test";
process.env.SONARR_API_KEY = "k";

const realFetch = globalThis.fetch;

/** Stands in for Radarr and Sonarr, which are addressed by path. */
function stubServices(handlers: Record<string, unknown>) {
  const calls: { url: string; method: string; body?: string }[] = [];
  globalThis.fetch = ((url: string, init: RequestInit = {}) => {
    calls.push({ url, method: init.method ?? "GET", body: init.body as string | undefined });
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
  await db.delete(seriesSubscriptions).where(eq(seriesSubscriptions.userId, userId));
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

const SEVERANCE = {
  title: "Severance",
  year: 2022,
  id: 9,
  tmdbId: 95396,
  tvdbId: 371980,
  seasons: [
    { seasonNumber: 1, monitored: true },
    { seasonNumber: 3, monitored: false },
  ],
};

const EPISODES = [
  { id: 101, seriesId: 9, seasonNumber: 3, episodeNumber: 1, monitored: false, hasFile: false },
  {
    id: 102,
    seriesId: 9,
    seasonNumber: 3,
    episodeNumber: 2,
    monitored: true,
    hasFile: true,
    episodeFileId: 55,
  },
  { id: 201, seriesId: 9, seasonNumber: 1, episodeNumber: 1, monitored: true, hasFile: true },
];

/** Sonarr with Severance in it, its season 3 unmonitored. */
function stubSonarr(overrides: Record<string, unknown> = {}) {
  return stubServices({
    "/series/lookup": [{ ...SEVERANCE }],
    "/episode/monitor": [],
    "/episode?seriesId=": EPISODES,
    "/queue": { records: [] },
    "/episodefile/": {},
    "/command": { id: 1, status: "queued" },
    "/api/v3/series/9": { ...SEVERANCE, seasons: SEVERANCE.seasons.map((s) => ({ ...s })) },
    ...overrides,
  });
}

describe("requestSeason", () => {
  test("monitors the season asked for and searches for it", async () => {
    const calls = stubSonarr();

    const { status } = await requestSeason({ tmdbId: 95396, seasonNumber: 3 });

    const update = calls.find((call) => call.method === "PUT" && call.url.endsWith("/series/9"));
    expect(JSON.parse(update!.body!).seasons).toEqual([
      { seasonNumber: 1, monitored: true },
      { seasonNumber: 3, monitored: true },
    ]);

    const search = calls.find((call) => call.url.includes("/command"));
    expect(JSON.parse(search!.body!)).toEqual({
      name: "SeasonSearch",
      seriesId: 9,
      seasonNumber: 3,
    });
    expect(status).toBe("added");
  });

  test("monitors the season's own episodes, since Sonarr searches for those", async () => {
    const calls = stubSonarr();

    await requestSeason({ tmdbId: 95396, seasonNumber: 3 });

    const monitor = calls.find((call) => call.url.includes("/episode/monitor"));
    expect(JSON.parse(monitor!.body!)).toEqual({ episodeIds: [101], monitored: true });
  });

  // The whole point: a series Sonarr does not hold yet must not drag in every
  // season of it just because someone asked for one.
  test("adds a series it does not hold with nothing monitored", async () => {
    const calls = stubSonarr({
      "/series/lookup": [{ ...SEVERANCE, id: null }],
      "/qualityprofile": [{ id: 1 }],
      "/rootfolder": [{ path: "/tv" }],
      "/api/v3/series": { ...SEVERANCE, seasons: SEVERANCE.seasons.map((s) => ({ ...s })) },
    });

    await requestSeason({ tmdbId: 95396, seasonNumber: 3 });

    const add = calls.find((call) => call.method === "POST" && call.url.endsWith("/series"));
    expect(JSON.parse(add!.body!).addOptions.monitor).toBe("none");
  });

  test("records the season against whoever asked, and subscribes them to it", async () => {
    stubSonarr();

    await requestSeason({
      tmdbId: 95396,
      seasonNumber: 3,
      requestedBy: { userId, conversationId },
    });

    const [request] = await db.select().from(mediaRequests).where(eq(mediaRequests.userId, userId));
    expect(request).toMatchObject({ tmdbId: 95396, serviceId: 9, seasonNumber: 3 });

    const [subscription] = await db
      .select()
      .from(seriesSubscriptions)
      .where(eq(seriesSubscriptions.userId, userId));
    expect(subscription).toMatchObject({ sonarrId: 9, seasonNumber: 3, active: true });
  });

  // Ownership is per season: two people on early seasons and one on a later
  // one is the case the whole model exists for.
  test("a season and the series as a whole are separate requests", async () => {
    stubSonarr();
    await requestSeries({ tmdbId: 95396, requestedBy: { userId } });

    stubSonarr();
    await requestSeason({ tmdbId: 95396, seasonNumber: 3, requestedBy: { userId } });
    stubSonarr();
    await requestSeason({ tmdbId: 95396, seasonNumber: 1, requestedBy: { userId } });

    const rows = await db.select().from(mediaRequests).where(eq(mediaRequests.userId, userId));
    expect(rows.map((row) => row.seasonNumber).sort()).toEqual([1, 3, null]);
  });

  test("asking for the same season twice keeps one request", async () => {
    stubSonarr();
    await requestSeason({ tmdbId: 95396, seasonNumber: 3, requestedBy: { userId } });
    stubSonarr();
    await requestSeason({ tmdbId: 95396, seasonNumber: 3, requestedBy: { userId } });

    expect(
      await db.select().from(mediaRequests).where(eq(mediaRequests.userId, userId)),
    ).toHaveLength(1);
  });

  // Retrying a season already monitored is the common case, and still searches.
  test("a season already monitored reads as existing", async () => {
    const calls = stubSonarr();

    const { status } = await requestSeason({ tmdbId: 95396, seasonNumber: 1 });

    expect(status).toBe("existing");
    expect(calls.some((call) => call.url.includes("/command"))).toBe(true);
  });

  // Searching again while a dead release sits in the queue finds the same
  // release, so the stuck one goes first.
  test("drops a stalled download of that season before searching", async () => {
    const calls = stubSonarr({
      "/queue": {
        records: [
          {
            id: 31,
            seriesId: 9,
            seasonNumber: 3,
            trackedDownloadStatus: "warning",
            statusMessages: [{ title: "The download is stalled with no connections" }],
          },
          {
            id: 32,
            seriesId: 9,
            seasonNumber: 1,
            trackedDownloadStatus: "warning",
            errorMessage: "stalled",
          },
        ],
      },
    });

    await requestSeason({ tmdbId: 95396, seasonNumber: 3 });

    const removed = calls.filter((call) => call.method === "DELETE");
    expect(removed).toHaveLength(1);
    expect(removed[0]!.url).toContain("/queue/31");
  });

  test("reports a season the series does not have", () => {
    stubSonarr();

    expect(requestSeason({ tmdbId: 95396, seasonNumber: 7 })).rejects.toThrow(MediaNotFoundError);
  });
});

describe("requestEpisode", () => {
  test("monitors and searches the one episode, owned at its season", async () => {
    const calls = stubSonarr();

    await requestEpisode({
      tmdbId: 95396,
      seasonNumber: 3,
      episodeNumber: 1,
      requestedBy: { userId },
    });

    const search = calls.find((call) => call.url.includes("/command"));
    expect(JSON.parse(search!.body!)).toEqual({ name: "EpisodeSearch", episodeIds: [101] });

    const [request] = await db.select().from(mediaRequests).where(eq(mediaRequests.userId, userId));
    expect(request?.seasonNumber).toBe(3);

    const [subscription] = await db
      .select()
      .from(seriesSubscriptions)
      .where(eq(seriesSubscriptions.userId, userId));
    expect(subscription).toMatchObject({ seasonNumber: 3, episodeNumber: 1 });
  });

  test("reports an episode the season does not have", () => {
    stubSonarr();

    expect(requestEpisode({ tmdbId: 95396, seasonNumber: 3, episodeNumber: 9 })).rejects.toThrow(
      MediaNotFoundError,
    );
  });
});

describe("releaseSeason", () => {
  test("deletes a multi-episode file once and completes the release", async () => {
    const calls = stubSonarr({
      "/episode?seriesId=": [
        { seasonNumber: 3, episodeFileId: 55 },
        { seasonNumber: 3, episodeFileId: 55 },
        { seasonNumber: 1, episodeFileId: 56 },
      ],
    });

    expect((await releaseSeason(9, 3)).filesDeleted).toBe(1);
    expect(calls.filter((call) => call.method === "DELETE")).toHaveLength(1);
    const update = calls.find((call) => call.method === "PUT");
    expect(JSON.parse(update!.body!).seasons).toContainEqual({ seasonNumber: 3, monitored: false });
  });

  test("deletes the season's files and unmonitors it, keeping the series", async () => {
    const calls = stubSonarr();

    const { filesDeleted } = await releaseSeason(9, 3);

    expect(filesDeleted).toBe(1);
    expect(calls).toContainEqual(
      expect.objectContaining({
        method: "DELETE",
        url: expect.stringContaining("/episodefile/55"),
      }),
    );
    expect(calls.every((call) => !call.url.endsWith("/series/9?deleteFiles=true"))).toBe(true);

    const update = calls.find((call) => call.method === "PUT" && call.url.endsWith("/series/9"));
    expect(JSON.parse(update!.body!).seasons).toContainEqual({
      seasonNumber: 3,
      monitored: false,
    });
  });

  test("nobody owns a released season, and nobody is told about it", async () => {
    stubSonarr();
    await requestSeason({ tmdbId: 95396, seasonNumber: 3, requestedBy: { userId } });
    stubSonarr();
    await requestSeason({ tmdbId: 95396, seasonNumber: 1, requestedBy: { userId } });

    stubSonarr();
    await releaseSeason(9, 3);

    const rows = await db.select().from(mediaRequests).where(eq(mediaRequests.userId, userId));
    expect(rows.map((row) => row.seasonNumber)).toEqual([1]);

    const [dropped] = await db
      .select()
      .from(seriesSubscriptions)
      .where(and(eq(seriesSubscriptions.userId, userId), eq(seriesSubscriptions.seasonNumber, 3)));
    expect(dropped?.active).toBe(false);
  });
});
