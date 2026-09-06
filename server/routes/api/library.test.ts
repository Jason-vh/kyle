import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";

process.env.JWT_SECRET = "test-secret-that-is-long-enough-for-hs256";

const removed: { mediaType: string; serviceId: number; deleteFiles: boolean }[] = [];
let listFails = false;

const realLibrary = await import("#server/library/service.ts");
mock.module("#server/library/service.ts", () => ({
  ...realLibrary,
  listLibrary: () => {
    if (listFails) return Promise.reject(new Error("Radarr is unreachable"));
    return Promise.resolve({ items: [], unavailable: [] });
  },
  removeLibraryItem: (mediaType: string, serviceId: number, deleteFiles: boolean) => {
    removed.push({ mediaType, serviceId, deleteFiles });
    return Promise.resolve();
  },
}));

const { handleGetLibrary, handleRemoveLibraryItem } = await import("#server/routes/api/library.ts");
const { signJwt, buildJwtCookie } = await import("#server/auth/jwt.ts");

let asUser = "";
let asAdmin = "";

beforeAll(async () => {
  asUser = buildJwtCookie(await signJwt({ id: "u1", name: "Jane", admin: false }), true).split(
    ";",
  )[0]!;
  asAdmin = buildJwtCookie(await signJwt({ id: "u2", name: "Sam", admin: true }), true).split(
    ";",
  )[0]!;
});

afterEach(() => {
  removed.length = 0;
  listFails = false;
});

function request(path: string, method: string, cookie?: string): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: cookie ? { Cookie: cookie } : {},
  });
}

describe("GET /api/library", () => {
  test("a signed-out visitor is refused", async () => {
    const res = await handleGetLibrary(request("/api/library", "GET"));
    expect(res.status).toBe(401);
  });

  test("anyone signed in may browse", async () => {
    const res = await handleGetLibrary(request("/api/library", "GET", asUser));
    expect(res.status).toBe(200);
  });

  // A trip to the server logs to learn what broke is a trip too many.
  test("an unreachable service says which one, rather than a tidy nothing", async () => {
    listFails = true;

    const res = await handleGetLibrary(request("/api/library", "GET", asUser));

    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: string }).error).toContain("Radarr is unreachable");
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
  test("a signed-out visitor is refused", async () => {
    expect((await remove()).status).toBe(401);
    expect(removed).toEqual([]);
  });

  test("a signed-in non-admin is refused", async () => {
    expect((await remove(asUser)).status).toBe(403);
    expect(removed).toEqual([]);
  });

  test("an admin may remove", async () => {
    expect((await remove(asAdmin)).status).toBe(200);
    expect(removed).toEqual([{ mediaType: "movie", serviceId: 42, deleteFiles: true }]);
  });

  test("files go with it unless the caller says otherwise", async () => {
    await remove(asAdmin, "series", "9", "?deleteFiles=false");
    expect(removed[0]?.deleteFiles).toBe(false);
  });

  test("an unknown media type is a miss, not a bad request", async () => {
    expect((await remove(asAdmin, "album", "1")).status).toBe(404);
    expect(removed).toEqual([]);
  });

  test("an id that is not a number is refused before anything happens", async () => {
    expect((await remove(asAdmin, "movie", "twelve")).status).toBe(400);
    expect(removed).toEqual([]);
  });
});
