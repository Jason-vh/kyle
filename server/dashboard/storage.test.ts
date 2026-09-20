import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { getRequestedBytes, getStorage, mountFor } from "./storage.ts";
import { invalidateStats } from "#server/ultra/api.ts";
import { db } from "#server/db/index.ts";
import { mediaRequests } from "#server/db/schema.ts";
import { createTestUser, deleteTestUser } from "#server/db/testing.ts";

const MOUNTS = [
  { path: "/", freeSpace: 400_000, totalSpace: 890_000 },
  { path: "/home/jason", freeSpace: 1_600_000, totalSpace: 15_900_000 },
];

describe("mountFor", () => {
  // The media disk and the root filesystem are both prefixes of the path;
  // reporting the root would show the wrong disk entirely.
  test("prefers the longest matching mount", () => {
    expect(mountFor("/home/jason/media/Movies", MOUNTS)?.path).toBe("/home/jason");
  });

  test("falls back to the root when nothing else matches", () => {
    expect(mountFor("/srv/media", MOUNTS)?.path).toBe("/");
  });

  test("matches a path that is the mount itself", () => {
    expect(mountFor("/home/jason", MOUNTS)?.path).toBe("/home/jason");
  });

  // `/home/jasonvh` is not inside `/home/jason`, however much it looks like it.
  test("does not match a mount that is only a string prefix", () => {
    expect(mountFor("/home/jasonvh/media", MOUNTS)?.path).toBe("/");
  });

  test("reports nothing when there are no mounts", () => {
    expect(mountFor("/media", [])).toBeUndefined();
  });
});

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

/** Radarr and Sonarr see the whole array, which is far bigger than the slot. */
const ROOTS = [{ path: "/home/jasonvh/media", freeSpace: 431_000_000_000 }];
const DISKS = [
  { path: "/home/jasonvh", freeSpace: 431_000_000_000, totalSpace: 15_990_000_000_000 },
];

const MOVIES = [
  { title: "Asked For", tmdbId: 111, sizeOnDisk: 4_000_000_000 },
  { title: "Nobody Asked", tmdbId: 222, sizeOnDisk: 9_000_000_000 },
];

const SERIES = [
  { title: "Asked For Too", tmdbId: 333, statistics: { sizeOnDisk: 2_000_000_000 } },
  { title: "Unasked", tmdbId: 444, statistics: { sizeOnDisk: 8_000_000_000 } },
];

function stubServices(options: { ultra?: unknown; ultraStatus?: number } = {}) {
  globalThis.fetch = ((url: string) => {
    if (url.includes("ultra.test")) {
      if (options.ultraStatus)
        return Promise.resolve(new Response("no", { status: options.ultraStatus }));
      return Promise.resolve(Response.json(options.ultra ?? QUOTA));
    }
    if (url.includes("/rootfolder")) return Promise.resolve(Response.json(ROOTS));
    if (url.includes("/diskspace")) return Promise.resolve(Response.json(DISKS));
    if (url.includes("radarr.test")) return Promise.resolve(Response.json(MOVIES));
    if (url.includes("sonarr.test")) return Promise.resolve(Response.json(SERIES));
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
  // Radarr and Sonarr see the array under the slot, not the slot's share of it.
  test("takes the seedbox quota over what the services can see", async () => {
    stubServices();

    const stat = await getStorage();

    expect(stat?.freeBytes).toBe(193_273_528_320);
    expect(stat?.totalBytes).toBe(7451 * 1024 ** 3);
  });

  test("falls back to the services when the seedbox cannot be reached", async () => {
    stubServices({ ultraStatus: 500 });

    const stat = await getStorage();

    expect(stat?.freeBytes).toBe(431_000_000_000);
    expect(stat?.totalBytes).toBe(15_990_000_000_000);
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

    expect((await getStorage())?.totalBytes).toBe(8 * 1024 ** 4);
  });

  test("asks the seedbox once, however often the page is loaded", async () => {
    const calls: string[] = [];
    stubServices();
    const stubbed = globalThis.fetch;
    globalThis.fetch = ((url: string, init?: RequestInit) => {
      if (url.includes("ultra.test")) calls.push(url);
      return (stubbed as (u: string, i?: RequestInit) => Promise<Response>)(url, init);
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

  test("says nothing rather than zero when a service is down", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(new Response("no", { status: 500 }))) as unknown as typeof fetch;

    expect(await getRequestedBytes()).toBeUndefined();
  });
});
