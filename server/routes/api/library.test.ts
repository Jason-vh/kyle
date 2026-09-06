import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { handleGetLibrary, handleRemoveLibraryItem } from "./library.ts";
import { buildJwtCookie, signJwt } from "#server/auth/jwt.ts";
import { createTestUser, deleteTestUser } from "#server/db/testing.ts";

// No mocks: the route runs the real service, with Radarr and Sonarr stubbed at
// the network. Plex is left unconfigured, which the watch index treats as
// nobody having watched anything.

process.env.JWT_SECRET = "test-secret-that-is-long-enough-for-hs256";
process.env.RADARR_HOST = "http://radarr.test";
process.env.RADARR_API_KEY = "k";
process.env.SONARR_HOST = "http://sonarr.test";
process.env.SONARR_API_KEY = "k";

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
  adminId = await createTestUser("Library Admin");
  asUser = buildJwtCookie(await signJwt({ id: userId, name: "Jane", admin: false }), true).split(
    ";",
  )[0]!;
  asAdmin = buildJwtCookie(await signJwt({ id: adminId, name: "Sam", admin: true }), true).split(
    ";",
  )[0]!;
});

afterEach(() => {
  globalThis.fetch = realFetch;
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

  test("a signed-in non-admin is refused, and nothing is called", async () => {
    const calls = stubServices(LIBRARY);

    expect((await remove(asUser)).status).toBe(403);
    expect(calls).toEqual([]);
  });

  test("an admin may remove, and the files go with it", async () => {
    const calls = stubServices({ "/api/v3/movie/42": {} });

    expect((await remove(asAdmin)).status).toBe(200);

    const [call] = calls;
    expect(call?.method).toBe("DELETE");
    expect(call?.url).toContain("deleteFiles=true");
  });

  test("the files stay when the caller says so", async () => {
    const calls = stubServices({ "/api/v3/series/9": {} });

    await remove(asAdmin, "series", "9", "?deleteFiles=false");

    expect(calls[0]?.url).toContain("deleteFiles=false");
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
