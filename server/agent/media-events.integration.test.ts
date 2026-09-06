import { afterEach, describe, expect, test } from "bun:test";
import { createAddMovieTool, removeMovieTool } from "#server/radarr/tools.ts";
import { createAddSeriesTool, removeSeriesTool } from "#server/sonarr/tools.ts";
import { extractMediaEvent } from "#server/db/media-events.ts";

// The tools are built with no requester, so nothing is attributed and nothing
// is written; only what they return matters here.

process.env.RADARR_HOST = "http://radarr.test";
process.env.RADARR_API_KEY = "k";
process.env.SONARR_HOST = "http://sonarr.test";
process.env.SONARR_API_KEY = "k";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function stub(handlers: Record<string, unknown>) {
  globalThis.fetch = ((url: string) => {
    for (const [fragment, body] of Object.entries(handlers)) {
      if (url.includes(fragment)) return Promise.resolve(Response.json(body));
    }
    return Promise.resolve(new Response("unexpected", { status: 500 }));
  }) as unknown as typeof fetch;
}

/**
 * `extractMediaEvent` reads each tool's JSON result by hand, so a tool quietly
 * changing what it returns stops media events — and subscriptions with them —
 * without anything failing. These run the real tools and feed their real output
 * to the extractor, which is the only way that stays true.
 */
describe("a tool's result and the event extracted from it", () => {
  test("add_movie", async () => {
    stub({
      "/movie?tmdbId=": [],
      "/movie/lookup/tmdb": { title: "Inception", year: 2010 },
      "/qualityprofile": [{ id: 1 }],
      "/rootfolder": [{ path: "/movies" }],
      "/api/v3/movie": { title: "Inception", year: 2010, id: 42, titleSlug: "inception-2010" },
    });

    const args = { tmdbId: 27205 };
    const output = await createAddMovieTool().execute("call-1", args);

    expect(extractMediaEvent("add_movie", args, output)).toEqual({
      action: "add",
      mediaType: "movie",
      title: "Inception",
      ids: { tmdb: 27205, radarr: 42, titleSlug: "inception-2010" },
    });
  });

  test("add_series", async () => {
    stub({
      "/series/lookup": [{ title: "Severance", year: 2022, tvdbId: 371980 }],
      "/qualityprofile": [{ id: 1 }],
      "/rootfolder": [{ path: "/tv" }],
      "/api/v3/series": {
        title: "Severance",
        year: 2022,
        id: 9,
        titleSlug: "severance",
        seasons: [],
      },
    });

    const args = { tvdbId: 371980, monitorOption: "all" as const };
    const output = await createAddSeriesTool().execute("call-2", args);

    expect(extractMediaEvent("add_series", args, output)).toEqual({
      action: "add",
      mediaType: "series",
      title: "Severance",
      ids: { tvdb: 371980, sonarr: 9, titleSlug: "severance" },
    });
  });

  test("remove_movie", async () => {
    stub({
      "/movie/42": {
        title: "Inception",
        year: 2010,
        tmdbId: 27205,
        imdbId: "tt1375666",
        titleSlug: "inception-2010",
      },
    });

    const args = { movieId: 42 };
    const output = await removeMovieTool.execute("call-3", args);

    expect(extractMediaEvent("remove_movie", args, output)).toMatchObject({
      action: "remove",
      mediaType: "movie",
      title: "Inception",
      ids: { radarr: 42, tmdb: 27205, imdb: "tt1375666" },
    });
  });

  test("remove_series", async () => {
    stub({
      "/series/9": { title: "Severance", year: 2022, tvdbId: 371980, titleSlug: "severance" },
    });

    const args = { seriesId: 9 };
    const output = await removeSeriesTool.execute("call-4", args);

    expect(extractMediaEvent("remove_series", args, output)).toMatchObject({
      action: "remove",
      mediaType: "series",
      title: "Severance",
      ids: { sonarr: 9, tvdb: 371980 },
    });
  });
});
