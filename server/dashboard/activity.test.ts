import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { getActivity } from "./activity.ts";
import { db } from "#server/db/index.ts";
import { mediaRequests } from "#server/db/schema.ts";
import { createTestUser, deleteTestUser } from "#server/db/testing.ts";

let userId = "";

beforeAll(async () => {
  userId = await createTestUser("Activity");
});

afterAll(async () => {
  await deleteTestUser(userId);
});

process.env.RADARR_HOST = "http://radarr.test";
process.env.RADARR_API_KEY = "k";
process.env.SONARR_HOST = "http://sonarr.test";
process.env.SONARR_API_KEY = "k";

const realFetch = globalThis.fetch;
afterEach(async () => {
  globalThis.fetch = realFetch;
  await db.delete(mediaRequests).where(eq(mediaRequests.userId, userId));
});

/** Radarr and Sonarr, each answering with its own history. */
function stubHistory(movies: unknown[], series: unknown[]) {
  globalThis.fetch = ((url: string) => {
    const records = url.includes("radarr.test") ? movies : series;
    return Promise.resolve(Response.json({ records }));
  }) as unknown as typeof fetch;
}

const IMPORT = "downloadFolderImported";

function movieRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    eventType: IMPORT,
    date: "2026-09-05T12:00:00Z",
    movie: { title: "Arrival", year: 2016, tmdbId: 329865 },
    ...overrides,
  };
}

function seriesRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    episodeId: 400,
    eventType: IMPORT,
    date: "2026-09-05T12:00:00Z",
    series: { title: "Severance", year: 2022, tmdbId: 95396 },
    episode: { seasonNumber: 1, episodeNumber: 4, title: "The You You Are" },
    ...overrides,
  };
}

/** One episode of a series, as its own import. */
function episodeRecord(
  seasonNumber: number,
  episodeNumber: number,
  overrides: Record<string, unknown> = {},
) {
  return seriesRecord({
    id: seasonNumber * 100 + episodeNumber,
    episodeId: seasonNumber * 100 + episodeNumber,
    episode: { seasonNumber, episodeNumber, title: `Episode ${episodeNumber}` },
    ...overrides,
  });
}

const since = new Date("2026-09-01T00:00:00Z");

describe("getActivity", () => {
  test("reports what landed, newest first", async () => {
    stubHistory(
      [movieRecord({ id: 7, date: "2026-09-02T00:00:00Z" })],
      [seriesRecord({ id: 9, date: "2026-09-04T00:00:00Z" })],
    );

    const activity = await getActivity(userId, since);

    expect(activity.map((item) => item.id)).toEqual(["series-tmdb-95396", "movie-7"]);
    expect(activity[0]).toMatchObject({
      mediaType: "series",
      title: "Severance",
      detail: "S01E04 The You You Are",
    });
  });

  // History is mostly grabs, failures and renames; only an import means it landed.
  test("ignores everything that is not an import", async () => {
    stubHistory([movieRecord({ eventType: "grabbed" })], [seriesRecord({ eventType: "grabbed" })]);

    expect(await getActivity(userId, since)).toEqual([]);
  });

  test("drops anything older than the window", async () => {
    stubHistory([movieRecord({ date: "2026-08-01T00:00:00Z" })], []);

    expect(await getActivity(userId, since)).toEqual([]);
  });

  test("says who asked for it", async () => {
    await db.insert(mediaRequests).values({
      userId,
      mediaType: "movie",
      tmdbId: 329865,
      title: "Arrival",
    });
    stubHistory([movieRecord()], []);

    const [item] = await getActivity(userId, since);
    expect(item?.requestedBy).toHaveLength(1);
    expect(item?.requestedByMe).toBe(true);
  });

  // The id both matches a request and links the row to the title's page.
  test("carries the TMDB id", async () => {
    stubHistory([movieRecord()], []);

    const [item] = await getActivity(userId, since);
    expect(item?.tmdbId).toBe(329865);
  });

  // A season arriving at once used to fill the whole feed with one series.
  test("gathers the episodes of one series into a single row", async () => {
    stubHistory([], [episodeRecord(1, 1), episodeRecord(1, 2), episodeRecord(1, 3)]);

    const activity = await getActivity(userId, since);

    expect(activity).toHaveLength(1);
    expect(activity[0]).toMatchObject({ title: "Severance", detail: "Season 1 · 3 episodes" });
  });

  test("counts episodes spanning seasons without naming one", async () => {
    stubHistory([], [episodeRecord(1, 9), episodeRecord(2, 1)]);

    const [item] = await getActivity(userId, since);

    expect(item?.detail).toBe("2 episodes");
  });

  test("leaves a lone episode named as itself", async () => {
    stubHistory([], [episodeRecord(1, 4, { episode: { seasonNumber: 1, episodeNumber: 4 } })]);

    const [item] = await getActivity(userId, since);

    expect(item?.detail).toBe("S01E04");
  });

  // Sonarr writes a second import when an episode is upgraded.
  test("counts an episode imported twice only once", async () => {
    stubHistory(
      [],
      [episodeRecord(1, 1), episodeRecord(1, 1, { id: 99, date: "2026-09-06T00:00:00Z" })],
    );

    const [item] = await getActivity(userId, since);

    expect(item?.detail).toBe("S01E01 Episode 1");
  });

  test("dates the row by the newest episode it holds", async () => {
    stubHistory(
      [],
      [
        episodeRecord(1, 1, { date: "2026-09-03T00:00:00Z" }),
        episodeRecord(1, 2, { date: "2026-09-08T00:00:00Z" }),
      ],
    );

    const [item] = await getActivity(userId, since);

    expect(item?.at).toBe("2026-09-08T00:00:00Z");
  });

  test("keeps two series apart", async () => {
    stubHistory(
      [],
      [
        episodeRecord(1, 1),
        episodeRecord(1, 1, { series: { title: "Slow Horses", year: 2022, tmdbId: 95480 } }),
      ],
    );

    const activity = await getActivity(userId, since);

    expect(activity.map((item) => item.title).sort()).toEqual(["Severance", "Slow Horses"]);
  });

  test("one service being down costs its half of the feed, not the page", async () => {
    globalThis.fetch = ((url: string) => {
      if (url.includes("radarr.test")) return Promise.resolve(new Response("no", { status: 500 }));
      return Promise.resolve(Response.json({ records: [seriesRecord()] }));
    }) as unknown as typeof fetch;

    const activity = await getActivity(userId, since);

    expect(activity).toHaveLength(1);
    expect(activity[0]!.mediaType).toBe("series");
  });
});
