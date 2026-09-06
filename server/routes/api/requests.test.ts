import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";

process.env.JWT_SECRET = "test-secret-that-is-long-enough-for-hs256";

const added: Record<string, unknown>[] = [];
let addFails: Error | null = null;

const realService = await import("#server/requests/service.ts");
mock.module("#server/requests/service.ts", () => ({
  ...realService,
  requestMovie: (input: Record<string, unknown>) => {
    if (addFails) return Promise.reject(addFails);
    added.push({ mediaType: "movie", ...input });
    return Promise.resolve({ status: "added", movie: { title: "Inception", year: 2010, id: 42 } });
  },
  requestSeries: (input: Record<string, unknown>) => {
    if (addFails) return Promise.reject(addFails);
    added.push({ mediaType: "series", ...input });
    return Promise.resolve({
      status: "existing",
      series: { title: "Severance", year: 2022, id: 9 },
    });
  },
}));

const { MediaNotFoundError } = realService;
const { handleCreateRequest } = await import("#server/routes/api/requests.ts");
const { signJwt, buildJwtCookie } = await import("#server/auth/jwt.ts");

let asUser = "";

beforeAll(async () => {
  asUser = buildJwtCookie(await signJwt({ id: "u1", name: "Jane", admin: false }), true).split(
    ";",
  )[0]!;
});

afterEach(() => {
  added.length = 0;
  addFails = null;
});

function post(body: unknown, cookie?: string, raw?: string): Request {
  return new Request("http://localhost/api/requests", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: raw ?? JSON.stringify(body),
  });
}

describe("POST /api/requests", () => {
  test("a signed-out visitor is refused", async () => {
    expect((await handleCreateRequest(post({ mediaType: "movie", tmdbId: 1 }))).status).toBe(401);
    expect(added).toEqual([]);
  });

  test("adds a movie for whoever asked", async () => {
    const res = await handleCreateRequest(post({ mediaType: "movie", tmdbId: 27205 }, asUser));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "added", title: "Inception", year: 2010 });
    expect(added).toEqual([
      { mediaType: "movie", tmdbId: 27205, requestedBy: { userId: "u1" }, posterPath: undefined },
    ]);
  });

  test("a series goes to the other half of the write path", async () => {
    const res = await handleCreateRequest(post({ mediaType: "series", tmdbId: 95396 }, asUser));

    expect(await res.json()).toEqual({ status: "existing", title: "Severance", year: 2022 });
    expect(added[0]?.mediaType).toBe("series");
  });

  // The browser sends what it already has, so the request list has art before
  // the services have anything at all.
  test("passes the poster through", async () => {
    await handleCreateRequest(
      post({ mediaType: "movie", tmdbId: 1, posterPath: "/p.jpg" }, asUser),
    );
    expect(added[0]?.posterPath).toBe("/p.jpg");
  });

  test.each([
    ["an unknown media type", { mediaType: "album", tmdbId: 1 }],
    ["a missing media type", { tmdbId: 1 }],
    ["a missing id", { mediaType: "movie" }],
    ["an id that is not a whole number", { mediaType: "movie", tmdbId: 1.5 }],
    ["an id that is not a number", { mediaType: "movie", tmdbId: "27205" }],
  ])("refuses %s before touching anything", async (_name, body) => {
    expect((await handleCreateRequest(post(body, asUser))).status).toBe(400);
    expect(added).toEqual([]);
  });

  test("refuses a body that is not JSON", async () => {
    const res = await handleCreateRequest(post(null, asUser, "not json"));
    expect(res.status).toBe(400);
  });

  test("a title neither service can resolve is a miss", async () => {
    addFails = new MediaNotFoundError("movie", 1);

    const res = await handleCreateRequest(post({ mediaType: "movie", tmdbId: 1 }, asUser));

    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toContain("No movie found");
  });

  test("an upstream failure surfaces its own message", async () => {
    addFails = new Error("Radarr said no root folders");

    const res = await handleCreateRequest(post({ mediaType: "movie", tmdbId: 1 }, asUser));

    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: string }).error).toContain("no root folders");
  });
});
