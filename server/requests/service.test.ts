import { afterEach, describe, expect, mock, test } from "bun:test";

const saved: unknown[] = [];
// Spread the real module so replacing one export does not hide the others.
const realRequests = await import("../db/requests.ts");
mock.module("../db/requests.ts", () => ({
  ...realRequests,
  saveMediaRequest: (input: unknown) => {
    saved.push(input);
    return Promise.resolve(input);
  },
}));

const { MediaNotFoundError, requestMedia } = await import("./service.ts");

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
});

describe("requestMedia", () => {
  test("adds a movie that is not in the library", async () => {
    const calls = stubServices({
      "/movie/lookup/tmdb": { title: "Arrival", year: 2016, id: 0 },
      "/qualityprofile": [{ id: 1 }],
      "/rootfolder": [{ path: "/movies" }],
      "/api/v3/movie": { title: "Arrival", year: 2016, id: 77 },
    });

    const outcome = await requestMedia({ userId: "u1", mediaType: "movie", tmdbId: 329865 });

    expect(outcome).toEqual({
      status: "added",
      mediaType: "movie",
      tmdbId: 329865,
      title: "Arrival",
      year: 2016,
      serviceId: 77,
    });
    expect(calls.some((c) => c.method === "POST")).toBe(true);
  });

  test("recognises a movie already in the library without adding it", async () => {
    const calls = stubServices({
      "/movie/lookup/tmdb": { title: "Arrival", year: 2016, id: 42 },
    });

    const outcome = await requestMedia({ userId: "u1", mediaType: "movie", tmdbId: 329865 });

    expect(outcome.status).toBe("existing");
    expect(outcome.serviceId).toBe(42);
    expect(calls.every((c) => c.method === "GET")).toBe(true);
  });

  test("resolves a series through Sonarr's own TMDB lookup", async () => {
    const calls = stubServices({
      "/series/lookup": [{ title: "Severance", year: 2022, tvdbId: 371980, id: null }],
      "/qualityprofile": [{ id: 1 }],
      "/rootfolder": [{ path: "/tv" }],
      "/api/v3/series": { title: "Severance", year: 2022, id: 9 },
    });

    const outcome = await requestMedia({ userId: "u1", mediaType: "series", tmdbId: 95396 });

    expect(outcome).toMatchObject({ status: "added", title: "Severance", serviceId: 9 });
    expect(calls[0]!.url).toContain("term=tmdb%3A95396");
  });

  test("records who asked for it", async () => {
    stubServices({ "/movie/lookup/tmdb": { title: "Arrival", year: 2016, id: 42 } });

    await requestMedia({ userId: "u1", mediaType: "movie", tmdbId: 329865, posterPath: "/p.jpg" });

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
  });

  test("reports a TMDB id neither service can resolve", async () => {
    stubServices({ "/series/lookup": [] });

    expect(requestMedia({ userId: "u1", mediaType: "series", tmdbId: 1 })).rejects.toThrow(
      MediaNotFoundError,
    );
  });
});
