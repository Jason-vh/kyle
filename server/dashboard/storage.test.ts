import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { getRequestedBytes, getStorage } from "./storage.ts";
import { invalidateStats } from "#server/ultra/api.ts";
import { db } from "#server/db/index.ts";
import { mediaRequests } from "#server/db/schema.ts";
import { createTestUser, deleteTestUser } from "#server/db/testing.ts";

// The seedbox, Radarr and Sonarr all answer at the network; the database is real.

process.env.RADARR_HOST = "http://radarr.test";
process.env.RADARR_API_KEY = "k";
process.env.SONARR_HOST = "http://sonarr.test";
process.env.SONARR_API_KEY = "k";
process.env.ULTRA_HOST = "http://ultra.test";
process.env.ULTRA_API_TOKEN = "t";

const realFetch = globalThis.fetch;

const QUOTA = {
  service_stats_info: {
    free_storage_bytes: 193_273_528_320,
    total_storage_value: 7451,
    total_storage_unit: "G",
  },
};

const MOVIES = [
  { title: "Asked For", tmdbId: 111, sizeOnDisk: 4_000_000_000 },
  { title: "Nobody Asked", tmdbId: 222, sizeOnDisk: 9_000_000_000 },
];

const SERIES = [
  { title: "Asked For Too", tmdbId: 333, statistics: { sizeOnDisk: 2_000_000_000 } },
  { title: "Unasked", tmdbId: 444, statistics: { sizeOnDisk: 8_000_000_000 } },
];

function stubServices(options: { ultra?: unknown; down?: "ultra" | "radarr" | "sonarr" } = {}) {
  const refused = new Response("no", { status: 500 });
  globalThis.fetch = ((url: string) => {
    if (url.includes("ultra.test")) {
      if (options.down === "ultra") return Promise.resolve(refused.clone());
      return Promise.resolve(Response.json(options.ultra ?? QUOTA));
    }
    if (url.includes("radarr.test")) {
      if (options.down === "radarr") return Promise.resolve(refused.clone());
      return Promise.resolve(Response.json(MOVIES));
    }
    if (url.includes("sonarr.test")) {
      if (options.down === "sonarr") return Promise.resolve(refused.clone());
      return Promise.resolve(Response.json(SERIES));
    }
    return Promise.resolve(new Response("unexpected", { status: 500 }));
  }) as unknown as typeof fetch;
}

let storageUserId = "";

beforeAll(async () => {
  storageUserId = await createTestUser("Storage");
});

afterAll(async () => {
  await deleteTestUser(storageUserId);
});

beforeEach(() => {
  invalidateStats();
});

afterEach(async () => {
  globalThis.fetch = realFetch;
  await db.delete(mediaRequests).where(eq(mediaRequests.userId, storageUserId));
});

describe("getStorage", () => {
  test("reports the quota the seedbox actually holds this slot to", async () => {
    stubServices();

    const stat = await getStorage();

    expect(stat.freeBytes).toBe(193_273_528_320);
    expect(stat.totalBytes).toBe(7451 * 1024 ** 3);
  });

  test("reads the unit the quota is quoted in", async () => {
    stubServices({
      ultra: {
        service_stats_info: {
          free_storage_bytes: 1,
          total_storage_value: 8,
          total_storage_unit: "T",
        },
      },
    });

    expect((await getStorage()).totalBytes).toBe(8 * 1024 ** 4);
  });

  // Radarr and Sonarr see the array under the slot and would answer with
  // roughly double the space. A wrong figure here is worse than none.
  test("fails rather than answering from somewhere else", async () => {
    stubServices({ down: "ultra" });

    expect(getStorage()).rejects.toThrow();
  });

  test("asks the seedbox once, however often the page is loaded", async () => {
    const calls: string[] = [];
    stubServices();
    const stubbed = globalThis.fetch as (u: string, i?: RequestInit) => Promise<Response>;
    globalThis.fetch = ((url: string, init?: RequestInit) => {
      if (url.includes("ultra.test")) calls.push(url);
      return stubbed(url, init);
    }) as unknown as typeof fetch;

    await getStorage();
    await getStorage();
    await getStorage();

    expect(calls).toHaveLength(1);
  });
});

describe("getRequestedBytes", () => {
  test("counts only what someone asked for, across both services", async () => {
    stubServices();
    await db.insert(mediaRequests).values([
      { userId: storageUserId, mediaType: "movie", tmdbId: 111, title: "Asked For" },
      { userId: storageUserId, mediaType: "series", tmdbId: 333, title: "Asked For Too" },
    ]);

    expect(await getRequestedBytes()).toBe(6_000_000_000);
  });

  test("counts nothing when nobody has asked for anything", async () => {
    stubServices();

    expect(await getRequestedBytes()).toBe(0);
  });

  // A movie and a series can share a TMDB id; they are numbered separately.
  test("does not mistake a series id for a movie one", async () => {
    stubServices();
    await db.insert(mediaRequests).values({
      userId: storageUserId,
      mediaType: "movie",
      tmdbId: 333,
      title: "Asked For Too",
    });

    expect(await getRequestedBytes()).toBe(0);
  });

  test.each(["radarr", "sonarr"] as const)("fails when %s cannot be reached", async (down) => {
    stubServices({ down });

    expect(getRequestedBytes()).rejects.toThrow();
  });
});
