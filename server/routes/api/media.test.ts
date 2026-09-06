import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { handleGetMediaDetail } from "./media.ts";
import { buildJwtCookie, signJwt } from "#server/auth/jwt.ts";
import { createTestUser, deleteTestUser } from "#server/db/testing.ts";
import { db } from "#server/db/index.ts";
import { mediaRequests } from "#server/db/schema.ts";
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
      "/queue": { records: [] },
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
    stubServices({
      "/tv/95396": SERIES,
      "/api/v3/series": [
        {
          id: 9,
          tmdbId: 95396,
          title: "Severance",
          monitored: true,
          statistics: { episodeFileCount: 9, episodeCount: 18, sizeOnDisk: 30 },
        },
      ],
      "/queue": { records: [] },
    });

    const body = (await (await get("series", "95396")).json()) as MediaDetail;

    expect(body.library?.availability).toBe("partial");
    expect(body.library?.detail).toBe("9/18 episodes");
    expect(body.runtime).toBe(50);
  });

  test("says how far along a download is", async () => {
    stubServices({
      "/movie/27205": MOVIE,
      "/api/v3/movie?tmdbId": [HELD_MOVIE],
      "/queue": { records: [{ movie: { id: 42 }, size: 100, sizeleft: 25, timeleft: "00:10:00" }] },
    });

    const body = (await (await get("movie", "27205")).json()) as MediaDetail;

    expect(body.progress).toBeCloseTo(0.75);
    expect(body.eta).toBe("00:10:00");
  });

  test("names who requested it, and whether the viewer did", async () => {
    await db
      .insert(mediaRequests)
      .values({ userId, mediaType: "movie", tmdbId: 27205, title: "Inception" });
    stubServices({ "/movie/27205": MOVIE, "/api/v3/movie?tmdbId": [], "/queue": { records: [] } });

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
