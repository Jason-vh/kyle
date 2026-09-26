import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { handleGetMediaDetail } from "./media.ts";
import { buildJwtCookie, signJwt } from "#server/auth/jwt.ts";
import { createTestUser, deleteTestUser } from "#server/db/testing.ts";
import { db } from "#server/db/index.ts";
import { mediaRequests } from "#server/db/schema.ts";
import { clearRemoval, recordRemoval } from "#server/db/removals.ts";
import type { MediaDetail } from "#shared/types.ts";

// No mocks: the route runs the real service, with TMDB, Radarr and Sonarr
// stubbed at the network. Plex is left unconfigured, which the watch index
// treats as nobody having watched anything.

process.env.JWT_SECRET = "test-secret-that-is-long-enough-for-hs256";
process.env.TMDB_API_TOKEN = "t";
process.env.RADARR_HOST = "http://radarr.test";
process.env.RADARR_API_KEY = "k";
process.env.SONARR_HOST = "http://sonarr.test";
process.env.SONARR_API_KEY = "k";

const realFetch = globalThis.fetch;

const MOVIE = {
  id: 27205,
  title: "Inception",
  release_date: "2010-07-15",
  overview: "A thief who steals corporate secrets.",
  tagline: "Your mind is the scene of the crime.",
  poster_path: "/poster.jpg",
  backdrop_path: "/backdrop.jpg",
  runtime: 148,
  genres: [{ id: 28, name: "Action" }],
  vote_average: 8.4,
  vote_count: 30000,
  status: "Released",
};

const SERIES = {
  id: 95396,
  name: "Severance",
  first_air_date: "2022-02-17",
  overview: "Work-life balance, surgically enforced.",
  poster_path: "/sev.jpg",
  backdrop_path: null,
  episode_run_time: [50],
  genres: [{ id: 18, name: "Drama" }],
  vote_average: 8.5,
  vote_count: 3000,
  status: "Returning Series",
};

const HELD_MOVIE = {
  id: 42,
  tmdbId: 27205,
  title: "Inception",
  year: 2010,
  monitored: true,
  hasFile: true,
  sizeOnDisk: 8_000_000_000,
};

const HELD_SERIES = {
  "/tv/95396": SERIES,
  "/api/v3/series": [
    {
      id: 9,
      tmdbId: 95396,
      title: "Severance",
      monitored: true,
      statistics: { episodeFileCount: 9, episodeCount: 18, sizeOnDisk: 30 },
      seasons: [
        { seasonNumber: 1, monitored: true, statistics: { episodeCount: 9, episodeFileCount: 9 } },
        { seasonNumber: 2, monitored: true, statistics: { episodeCount: 9, episodeFileCount: 0 } },
      ],
    },
  ],
  "/api/v3/episode?seriesId=9": [
    { seasonNumber: 1, episodeNumber: 2, title: "Half Loop", hasFile: true, monitored: true },
    {
      seasonNumber: 1,
      episodeNumber: 1,
      title: "Good News About Hell",
      hasFile: true,
      monitored: true,
    },
  ],
  "/queue": { records: [], totalRecords: 0 },
};

/** Answers whichever upstream the URL names; anything else is a test bug. */
function stubServices(handlers: Record<string, unknown>): string[] {
  const urls: string[] = [];
  globalThis.fetch = ((url: string) => {
    urls.push(url);
    for (const [fragment, body] of Object.entries(handlers)) {
      if (!url.includes(fragment)) continue;
      const status = body === 404 ? 404 : 200;
      return Promise.resolve(
        status === 404 ? new Response("not found", { status: 404 }) : Response.json(body),
      );
    }
    return Promise.resolve(new Response("unexpected", { status: 500 }));
  }) as unknown as typeof fetch;
  return urls;
}

let userId = "";
let cookie = "";

beforeAll(async () => {
  userId = await createTestUser("Media Route");
  cookie = buildJwtCookie(await signJwt({ id: userId, name: "Jane", admin: false }), true).split(
    ";",
  )[0]!;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

afterAll(async () => {
  await deleteTestUser(userId);
});

function get(mediaType: string, tmdbId: string, auth = cookie): Promise<Response> {
  const req = new Request(`http://localhost/api/media/${mediaType}/${tmdbId}`, {
    headers: auth ? { Cookie: auth } : {},
  });
  return handleGetMediaDetail(req, mediaType, tmdbId);
}

describe("GET /api/media/:mediaType/:tmdbId", () => {
  test("a signed-out visitor is refused", async () => {
    expect((await get("movie", "27205", "")).status).toBe(401);
  });

  test("an unknown media type is a miss", async () => {
    expect((await get("album", "27205")).status).toBe(404);
  });

  test("an id that is not a number is refused before anything happens", async () => {
    const urls = stubServices({});
    expect((await get("movie", "nope")).status).toBe(400);
    expect(urls).toEqual([]);
  });

  test("describes a movie and what we hold of it", async () => {
    stubServices({
      "/movie/27205": MOVIE,
      "/api/v3/movie?tmdbId": [HELD_MOVIE],
      "/queue": { records: [], totalRecords: 0 },
    });

    const res = await get("movie", "27205");
    expect(res.status).toBe(200);

    const body = (await res.json()) as MediaDetail;
    expect(body.title).toBe("Inception");
    expect(body.year).toBe(2010);
    expect(body.runtime).toBe(148);
    expect(body.genres).toEqual(["Action"]);
    expect(body.library).toEqual({
      serviceId: 42,
      monitored: true,
      sizeOnDisk: 8_000_000_000,
      availability: "available",
    });
    expect(body.unavailable).toEqual([]);
  });

  // Sonarr cannot look a series up by TMDB id, so the listing is searched.
  test("finds a series by TMDB id in Sonarr's own listing", async () => {
    stubServices(HELD_SERIES);

    const body = (await (await get("series", "95396")).json()) as MediaDetail;

    expect(body.library?.availability).toBe("partial");
    expect(body.library?.detail).toBe("9/18 episodes");
    expect(body.runtime).toBe(50);
  });

  test("breaks a series down into its seasons and episodes", async () => {
    stubServices(HELD_SERIES);

    const body = (await (await get("series", "95396")).json()) as MediaDetail;

    expect(body.seasons?.map((season) => season.seasonNumber)).toEqual([1, 2]);
    expect(body.seasons?.[0]?.episodes.map((episode) => episode.title)).toEqual([
      "Good News About Hell",
      "Half Loop",
    ]);
  });

  test("a movie has no seasons", async () => {
    stubServices({
      "/movie/27205": MOVIE,
      "/api/v3/movie?tmdbId": [HELD_MOVIE],
      "/queue": { records: [], totalRecords: 0 },
    });

    const body = (await (await get("movie", "27205")).json()) as MediaDetail;

    expect(body.seasons).toBeUndefined();
  });

  test("says how far along a download is", async () => {
    stubServices({
      "/movie/27205": MOVIE,
      "/api/v3/movie?tmdbId": [HELD_MOVIE],
      "/queue": {
        totalRecords: 1,
        records: [{ id: 1, movie: { id: 42 }, size: 100, sizeleft: 25, timeleft: "00:10:00" }],
      },
    });

    const body = (await (await get("movie", "27205")).json()) as MediaDetail;

    expect(body.progress).toBeCloseTo(0.75);
    expect(body.eta).toBe("00:10:00");
  });

  test("names who requested it, and whether the viewer did", async () => {
    await db
      .insert(mediaRequests)
      .values({ userId, mediaType: "movie", tmdbId: 27205, title: "Inception" });
    stubServices({
      "/movie/27205": MOVIE,
      "/api/v3/movie?tmdbId": [],
      "/queue": { records: [], totalRecords: 0 },
    });

    const body = (await (await get("movie", "27205")).json()) as MediaDetail;

    expect(body.requestedBy).toHaveLength(1);
    expect(body.requestedBy[0]).toStartWith("Media Route");
    expect(body.requestedByMe).toBe(true);
  });

  // Without the description there is no page; without Radarr there is still one.
  test("a title TMDB has never heard of is a miss, not a broken service", async () => {
    stubServices({ "/movie/1": 404 });
    expect((await get("movie", "1")).status).toBe(404);
  });

  test("names the service it could not reach, and describes the title anyway", async () => {
    stubServices({ "/movie/27205": MOVIE });

    const res = await get("movie", "27205");
    expect(res.status).toBe(200);

    const body = (await res.json()) as MediaDetail;
    expect(body.title).toBe("Inception");
    expect(body.library).toBeUndefined();
    expect(body.unavailable).toEqual(["Radarr"]);
  });
});

describe("where a title stands", () => {
  const NO_QUEUE = { "/queue": { records: [], totalRecords: 0 } };

  function movieHeld(movie: Record<string, unknown>) {
    return {
      "/movie/27205": MOVIE,
      "/api/v3/movie?tmdbId": [{ ...HELD_MOVIE, ...movie }],
      ...NO_QUEUE,
    };
  }

  test("a movie on disk is ready, and says at what resolution", async () => {
    stubServices(
      movieHeld({
        movieFile: { quality: { quality: { resolution: 2160 } } },
      }),
    );

    const body = (await (await get("movie", "27205")).json()) as MediaDetail;

    expect(body.status?.state).toBe("ready");
    expect(body.quality).toBe("4K");
  });

  // What the page used to call "Missing": it is simply not out at home yet.
  test("a movie still only in cinemas is waiting, not missing", async () => {
    stubServices(
      movieHeld({
        hasFile: false,
        status: "inCinemas",
        inCinemas: "2026-09-23T00:00:00Z",
      }),
    );

    const body = (await (await get("movie", "27205")).json()) as MediaDetail;

    expect(body.status?.state).toBe("waiting");
  });

  test("a movie out and not found is being looked for", async () => {
    stubServices(
      movieHeld({ hasFile: false, status: "released", lastSearchTime: "2026-06-18T13:40:27Z" }),
    );

    const body = (await (await get("movie", "27205")).json()) as MediaDetail;

    expect(body.status).toMatchObject({ state: "searching", since: "2026-06-18T13:40:27Z" });
  });

  test("a series short of episodes is ready, and says which seasons are short", async () => {
    stubServices(HELD_SERIES);

    const body = (await (await get("series", "95396")).json()) as MediaDetail;

    expect(body.status).toMatchObject({ state: "ready", missing: [{ season: 2, episodes: 9 }] });
  });

  test("a title nobody holds or removed has no status", async () => {
    await clearRemoval("movie", 27205);
    stubServices({ "/movie/27205": MOVIE, "/api/v3/movie?tmdbId": [], ...NO_QUEUE });

    const body = (await (await get("movie", "27205")).json()) as MediaDetail;

    expect(body.status).toBeUndefined();
  });

  test("a title somebody removed says who", async () => {
    await recordRemoval({
      mediaType: "movie",
      tmdbId: 27205,
      title: "Inception",
      removedBy: "Kate",
      deletedFiles: true,
    });
    stubServices({ "/movie/27205": MOVIE, "/api/v3/movie?tmdbId": [], ...NO_QUEUE });

    try {
      const body = (await (await get("movie", "27205")).json()) as MediaDetail;
      expect(body.status).toMatchObject({ state: "removed", detail: "Removed by Kate" });
    } finally {
      await clearRemoval("movie", 27205);
    }
  });

  test("an unreachable service leaves the state unknown", async () => {
    stubServices({ "/movie/27205": MOVIE });

    const body = (await (await get("movie", "27205")).json()) as MediaDetail;

    expect(body.status?.state).toBe("unknown");
  });

  test("gives the earliest release of each kind", async () => {
    stubServices({
      "/movie/27205": {
        ...MOVIE,
        release_dates: {
          results: [
            {
              iso_3166_1: "US",
              release_dates: [
                { type: 3, release_date: "2010-07-16T00:00:00.000Z" },
                { type: 4, release_date: "2010-12-07T00:00:00.000Z" },
              ],
            },
          ],
        },
      },
      "/api/v3/movie?tmdbId": [],
      ...NO_QUEUE,
    });

    const body = (await (await get("movie", "27205")).json()) as MediaDetail;

    expect(body.releases).toEqual({ cinema: "2010-07-16", digital: "2010-12-07" });
  });
});
