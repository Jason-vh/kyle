import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import type { ActivityItem } from "#shared/types.ts";
import { getActivity, __testing } from "./activity.ts";
import { db } from "#server/db/index.ts";
import { mediaRequests } from "#server/db/schema.ts";
import { createTestUser, deleteTestUser } from "#server/db/testing.ts";

const { annotate } = __testing;

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
    eventType: IMPORT,
    date: "2026-09-05T12:00:00Z",
    series: { title: "Severance", year: 2022, tmdbId: 95396 },
    episode: { seasonNumber: 1, episodeNumber: 4, title: "The You You Are" },
    ...overrides,
  };
}

const since = new Date("2026-09-01T00:00:00Z");

describe("annotate", () => {
  function item(overrides: Partial<ActivityItem & { tmdbId?: number }> = {}) {
    return {
      id: "movie-1",
      mediaType: "movie" as const,
      title: "Arrival",
      at: "2026-09-05T12:00:00Z",
      requestedBy: [],
      requestedByMe: false,
      tmdbId: 329865,
      ...overrides,
    };
  }

  test("names everyone who asked, and flags the viewer's own", () => {
    const items = [item()];
    annotate(items, "u1", [
      { mediaType: "movie", tmdbId: 329865, userId: "u1", name: "Bob" },
      { mediaType: "movie", tmdbId: 329865, userId: "u2", name: "Jane" },
    ]);

    expect(items[0]).toMatchObject({ requestedBy: ["Bob", "Jane"], requestedByMe: true });
  });

  test("someone else's request is not mine", () => {
    const items = [item()];
    annotate(items, "u1", [{ mediaType: "movie", tmdbId: 329865, userId: "u2", name: "Jane" }]);

    expect(items[0]).toMatchObject({ requestedBy: ["Jane"], requestedByMe: false });
  });

  // The two services number their ids independently, so a movie and a series
  // can share one.
  test("a request does not attach to the other media type with the same id", () => {
    const items = [item()];
    annotate(items, "u1", [{ mediaType: "series", tmdbId: 329865, userId: "u1", name: "Bob" }]);

    expect(items[0]!.requestedBy).toEqual([]);
  });

  // A library that predates Kyle has plenty of these.
  test("leaves anything nobody asked for alone", () => {
    const items = [item({ tmdbId: undefined })];
    annotate(items, "u1", [{ mediaType: "movie", tmdbId: 329865, userId: "u1", name: "Bob" }]);

    expect(items[0]).toMatchObject({ requestedBy: [], requestedByMe: false });
  });
});

describe("getActivity", () => {
  test("reports what landed, newest first", async () => {
    stubHistory(
      [movieRecord({ id: 7, date: "2026-09-02T00:00:00Z" })],
      [seriesRecord({ id: 9, date: "2026-09-04T00:00:00Z" })],
    );

    const activity = await getActivity(userId, since);

    expect(activity.map((item) => item.id)).toEqual(["series-9", "movie-7"]);
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
