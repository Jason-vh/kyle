import { afterEach, describe, expect, mock, test } from "bun:test";

const saved: unknown[] = [];
const subscribed: unknown[] = [];

// Spread the real modules so replacing one export does not hide the others.
const realRequests = await import("#server/db/requests.ts");
mock.module("#server/db/requests.ts", () => ({
  ...realRequests,
  saveMediaRequest: (input: unknown) => {
    saved.push(input);
    return Promise.resolve(input);
  },
}));

const realSubscriptions = await import("#server/db/subscriptions.ts");
mock.module("#server/db/subscriptions.ts", () => ({
  ...realSubscriptions,
  upsertMovieSubscription: (userId: string, radarrId: number, conversationId: string | null) => {
    subscribed.push({ userId, radarrId, conversationId });
    return Promise.resolve();
  },
  upsertSeriesSubscription: (userId: string, sonarrId: number, conversationId: string | null) => {
    subscribed.push({ userId, sonarrId, conversationId });
    return Promise.resolve();
  },
}));

const { MediaNotFoundError, requestMovie, requestSeries } = await import("./service.ts");

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

process.env.RADARR_HOST = "http://radarr.test";
process.env.RADARR_API_KEY = "k";
process.env.SONARR_HOST = "http://sonarr.test";
process.env.SONARR_API_KEY = "k";

afterEach(() => {
  globalThis.fetch = realFetch;
  saved.length = 0;
  subscribed.length = 0;
});

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
    const calls = stubServices({
      "/movie?tmdbId=": [{ title: "Arrival", year: 2016, id: 42 }],
      "/movie/lookup/tmdb": { title: "Arrival", year: 2016, id: null },
    });

    const { status, movie } = await requestMovie({ tmdbId: 329865 });

    expect(status).toBe("existing");
    expect(movie.id).toBe(42);
    expect(calls.every((c) => c.method === "GET")).toBe(true);
  });

  test("records who asked for it and subscribes them", async () => {
    stubServices({ "/movie?tmdbId=": [{ title: "Arrival", year: 2016, id: 42 }] });

    await requestMovie({
      tmdbId: 329865,
      posterPath: "/p.jpg",
      requestedBy: { userId: "u1", conversationId: "c1" },
    });

    expect(saved).toEqual([
      {
        userId: "u1",
        mediaType: "movie",
        tmdbId: 329865,
        title: "Arrival",
        year: 2016,
        posterPath: "/p.jpg",
        serviceId: 42,
      },
    ]);
    expect(subscribed).toEqual([{ userId: "u1", radarrId: 42, conversationId: "c1" }]);
  });

  test("records nothing when nobody can be attributed", async () => {
    stubServices({ "/movie?tmdbId=": [{ title: "Arrival", year: 2016, id: 42 }] });

    await requestMovie({ tmdbId: 329865 });

    expect(saved).toEqual([]);
    expect(subscribed).toEqual([]);
  });

  test("reports a TMDB id Radarr cannot resolve", () => {
    stubServices({ "/movie?tmdbId=": [], "/movie/lookup/tmdb": {} });

    expect(requestMovie({ tmdbId: 1 })).rejects.toThrow(MediaNotFoundError);
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

    await requestSeries({ tvdbId: 371980, requestedBy: { userId: "u1" } });

    expect(calls[0]!.url).toContain("term=tvdb%3A371980");
    expect(saved).toMatchObject([{ tmdbId: 95396, serviceId: 9 }]);
  });

  test("subscribes a browser request with no conversation to answer in", async () => {
    stubServices({
      "/series/lookup": [{ title: "Severance", year: 2022, tvdbId: 371980, id: 9 }],
      "/api/v3/series/9": { title: "Severance", year: 2022, id: 9, tmdbId: 95396 },
    });

    await requestSeries({ tmdbId: 95396, requestedBy: { userId: "u1" } });

    expect(subscribed).toEqual([{ userId: "u1", sonarrId: 9, conversationId: null }]);
  });

  test("reports a TMDB id Sonarr cannot resolve", () => {
    stubServices({ "/series/lookup": [] });

    expect(requestSeries({ tmdbId: 1 })).rejects.toThrow(MediaNotFoundError);
  });
});
