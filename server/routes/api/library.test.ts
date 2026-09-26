import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { handleGetLibrary, handleRemoveLibraryItem } from "./library.ts";
import { buildJwtCookie, signJwt } from "#server/auth/jwt.ts";
import { createTestUser, deleteTestUser } from "#server/db/testing.ts";
import { db } from "#server/db/index.ts";
import { mediaRequests } from "#server/db/schema.ts";
import { invalidateStats } from "#server/ultra/api.ts";

// No mocks: the route runs the real service, with Radarr and Sonarr stubbed at
// the network. Plex is left unconfigured, which the watch index treats as
// nobody having watched anything.

process.env.JWT_SECRET = "test-secret-that-is-long-enough-for-hs256";
process.env.RADARR_HOST = "http://radarr.test";
process.env.RADARR_API_KEY = "k";
process.env.SONARR_HOST = "http://sonarr.test";
process.env.SONARR_API_KEY = "k";
process.env.ULTRA_HOST = "http://ultra.test";
process.env.ULTRA_API_TOKEN = "t";

const realFetch = globalThis.fetch;

interface Call {
  url: string;
  method: string;
}

function stubServices(handlers: Record<string, unknown>): Call[] {
  const calls: Call[] = [];
  globalThis.fetch = ((url: string, init: RequestInit = {}) => {
    calls.push({ url, method: init.method ?? "GET" });
    for (const [fragment, body] of Object.entries(handlers)) {
      if (url.includes(fragment)) return Promise.resolve(Response.json(body));
    }
    return Promise.resolve(new Response("unexpected", { status: 500 }));
  }) as unknown as typeof fetch;
  return calls;
}

const LIBRARY = {
  "/api/v3/movie": [{ id: 42, title: "Inception", year: 2010, tmdbId: 27205, hasFile: true }],
  "/api/v3/series": [{ id: 9, title: "Severance", year: 2022, tmdbId: 95396, seasons: [] }],
};

let userId = "";
let adminId = "";
let asUser = "";
let asAdmin = "";

beforeAll(async () => {
  userId = await createTestUser("Library Route");
  adminId = await createTestUser("Library Admin", true);
  asUser = buildJwtCookie(await signJwt({ id: userId, name: "Jane", admin: false }), true).split(
    ";",
  )[0]!;
  asAdmin = buildJwtCookie(await signJwt({ id: adminId, name: "Sam", admin: true }), true).split(
    ";",
  )[0]!;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  invalidateStats();
});

afterAll(async () => {
  await deleteTestUser(userId);
  await deleteTestUser(adminId);
});

function request(path: string, method: string, cookie?: string): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: cookie ? { Cookie: cookie } : {},
  });
}

describe("GET /api/library", () => {
  test("a signed-out visitor is refused", async () => {
    expect((await handleGetLibrary(request("/api/library", "GET"))).status).toBe(401);
  });

  test("anyone signed in may browse what the services hold", async () => {
    stubServices(LIBRARY);

    const res = await handleGetLibrary(request("/api/library", "GET", asUser));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { title: string }[]; unavailable: string[] };
    expect(body.items.map((item) => item.title)).toEqual(["Inception", "Severance"]);
    expect(body.unavailable).toEqual([]);
  });

  // One service being down hides its half rather than the whole library.
  test("names a service it could not reach", async () => {
    stubServices({ "/api/v3/series": [{ id: 9, title: "Severance", seasons: [] }] });

    const body = (await (
      await handleGetLibrary(request("/api/library", "GET", asUser))
    ).json()) as {
      items: unknown[];
      unavailable: string[];
    };

    expect(body.unavailable).toEqual(["Radarr"]);
    expect(body.items).toHaveLength(1);
  });

  test("includes the seedbox quota", async () => {
    stubServices({
      ...LIBRARY,
      "ultra.test": {
        service_stats_info: {
          free_storage_bytes: 2_000_000_000_000,
          total_storage_value: 8,
          total_storage_unit: "T",
        },
      },
    });

    const body = (await (
      await handleGetLibrary(request("/api/library", "GET", asUser))
    ).json()) as { storage?: unknown; unavailable: string[] };

    expect(body.storage).toEqual({ freeBytes: 2_000_000_000_000, totalBytes: 8 * 1024 ** 4 });
    expect(body.unavailable).toEqual([]);
  });

  test("leaves the quota out when the seedbox cannot be read", async () => {
    stubServices(LIBRARY);

    const res = await handleGetLibrary(request("/api/library", "GET", asUser));
    const body = (await res.json()) as {
      items: unknown[];
      storage?: unknown;
      unavailable: string[];
    };

    expect(res.status).toBe(200);
    expect(body.items).toHaveLength(2);
    expect(body.storage).toBeUndefined();
    expect(body.unavailable).toEqual([]);
  });

  test("says how far along a title with nothing on disk is downloading", async () => {
    stubServices({
      "radarr.test/api/v3/queue": {
        records: [
          {
            id: 1,
            movie: { id: 43 },
            status: "downloading",
            trackedDownloadStatus: "ok",
            trackedDownloadState: "downloading",
            size: 100,
            sizeleft: 25,
          },
        ],
        totalRecords: 1,
      },
      "sonarr.test/api/v3/queue": { records: [], totalRecords: 0 },
      "/api/v3/movie": [
        ...LIBRARY["/api/v3/movie"],
        { id: 43, title: "Arrival", year: 2016, tmdbId: 329865, hasFile: false },
      ],
      "/api/v3/series": LIBRARY["/api/v3/series"],
    });

    const body = (await (
      await handleGetLibrary(request("/api/library", "GET", asUser))
    ).json()) as { items: { title: string; download?: unknown }[] };

    const byTitle = Object.fromEntries(body.items.map((item) => [item.title, item.download]));
    expect(byTitle.Arrival).toEqual({ state: "downloading", progress: 0.75 });
    expect(byTitle.Inception).toBeUndefined();
  });
});

describe("DELETE /api/library/:type/:id", () => {
  const remove = (cookie?: string, type = "movie", id = "42", query = "") =>
    handleRemoveLibraryItem(
      request(`/api/library/${type}/${id}${query}`, "DELETE", cookie),
      type,
      id,
    );

  // Deleting files off disk is the most destructive thing the app can do.
  test("a signed-out visitor is refused, and nothing is called", async () => {
    const calls = stubServices(LIBRARY);

    expect((await remove()).status).toBe(401);
    expect(calls).toEqual([]);
  });

  test("someone who did not request it is refused, and nothing is removed", async () => {
    const calls = stubServices({
      "/api/v3/movie/42": { id: 42, title: "Inception", tmdbId: 27205, hasFile: true },
    });

    expect((await remove(asUser)).status).toBe(403);
    expect(calls.filter((call) => call.method === "DELETE")).toEqual([]);
  });

  test("whoever requested it may remove it", async () => {
    await db
      .insert(mediaRequests)
      .values({ userId, mediaType: "movie", tmdbId: 27205, title: "Inception" });
    const calls = stubServices({
      "/api/v3/movie/42": { id: 42, title: "Inception", tmdbId: 27205, hasFile: true },
    });

    expect((await remove(asUser)).status).toBe(200);
    expect(calls.some((call) => call.method === "DELETE")).toBe(true);
  });

  test("an admin may remove, and the files go with it", async () => {
    const calls = stubServices({ "/api/v3/movie/42": {} });

    expect((await remove(asAdmin)).status).toBe(200);

    const deletion = calls.find((call) => call.method === "DELETE");
    expect(deletion?.url).toContain("deleteFiles=true");
  });

  // The service forgets the title on deletion, so it is read while it is there.
  test("reads the title before removing it, so the removal can be recorded", async () => {
    const calls = stubServices({ "/api/v3/movie/42": {} });

    await remove(asAdmin);

    expect(calls[0]?.method).toBe("GET");
    expect(calls[0]?.url).toContain("/movie/42");
  });

  test("the files stay when the caller says so", async () => {
    const calls = stubServices({ "/api/v3/series/9": {} });

    await remove(asAdmin, "series", "9", "?deleteFiles=false");

    const deletion = calls.find((call) => call.method === "DELETE");
    expect(deletion?.url).toContain("deleteFiles=false");
  });

  test("an unknown media type is a miss, not a bad request", async () => {
    const calls = stubServices(LIBRARY);

    expect((await remove(asAdmin, "album", "1")).status).toBe(404);
    expect(calls).toEqual([]);
  });

  test("an id that is not a number is refused before anything happens", async () => {
    const calls = stubServices(LIBRARY);

    expect((await remove(asAdmin, "movie", "twelve")).status).toBe(400);
    expect(calls).toEqual([]);
  });
});
