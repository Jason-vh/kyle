import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { inArray } from "drizzle-orm";
import { db } from "#server/db/index.ts";
import { mediaRemovals } from "#server/db/schema.ts";
import { createTestUser, deleteTestUser } from "#server/db/testing.ts";
import { signJwt, buildJwtCookie } from "#server/auth/jwt.ts";
import { removeMovieTool } from "#server/radarr/tools.ts";
import { removeSeriesTool } from "#server/sonarr/tools.ts";
import { parseToolPayload } from "#server/agent/tool-result.ts";
import { handleRemoveLibraryItem } from "#server/routes/api/library.ts";
import { getLibraryIndex, invalidateLibraryIndex } from "#server/requests/library.ts";

process.env.JWT_SECRET = "test-secret-that-is-long-enough-for-hs256";
process.env.RADARR_HOST = "http://radarr.test";
process.env.RADARR_API_KEY = "k";
process.env.SONARR_HOST = "http://sonarr.test";
process.env.SONARR_API_KEY = "k";

const movie = {
  id: 8001,
  tmdbId: 800001,
  title: "Removal movie",
  year: 2020,
  hasFile: true,
  monitored: true,
};
const series = {
  id: 8002,
  tmdbId: 800002,
  tvdbId: 800003,
  title: "Removal series",
  year: 2021,
  seasons: [],
};
const realFetch = globalThis.fetch;
let adminId: string;
let cookie: string;

beforeAll(async () => {
  adminId = await createTestUser("Removal admin", true);
  cookie = buildJwtCookie(await signJwt({ id: adminId, name: "Admin", admin: true }), true).split(
    ";",
  )[0]!;
});

afterEach(async () => {
  globalThis.fetch = realFetch;
  invalidateLibraryIndex();
  await db
    .delete(mediaRemovals)
    .where(inArray(mediaRemovals.tmdbId, [movie.tmdbId, series.tmdbId]));
});

afterAll(async () => {
  await deleteTestUser(adminId);
});

function stubLibrary(failDelete = false) {
  const state = { movie: true, series: true, deleted: [] as string[] };
  invalidateLibraryIndex();
  globalThis.fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input));
    if (init.method === "DELETE") {
      if (failDelete) return new Response("offline", { status: 503 });
      state.deleted.push(url.pathname);
      if (url.pathname.endsWith(`/movie/${movie.id}`)) state.movie = false;
      else if (url.pathname.endsWith(`/series/${series.id}`)) state.series = false;
      else return new Response("unexpected", { status: 500 });
      expect(url.searchParams.get("deleteFiles")).toBe("true");
      return new Response(null, { status: 204 });
    }
    if (url.pathname.endsWith(`/movie/${movie.id}`)) return Response.json(movie);
    if (url.pathname.endsWith(`/series/${series.id}`)) return Response.json(series);
    if (url.pathname.endsWith("/movie")) return Response.json(state.movie ? [movie] : []);
    if (url.pathname.endsWith("/series")) return Response.json(state.series ? [series] : []);
    return new Response("unexpected", { status: 500 });
  }) as unknown as typeof fetch;
  return state;
}

for (const mediaType of ["movie", "series"] as const) {
  for (const source of ["chat", "browser"] as const) {
    test(`${source} ${mediaType} removal records the title and invalidates the library`, async () => {
      const state = stubLibrary();
      const item = mediaType === "movie" ? movie : series;
      expect((await getLibraryIndex())[mediaType].has(item.tmdbId)).toBe(true);

      if (source === "browser") {
        const req = new Request(`http://localhost/api/library/${mediaType}/${item.id}`, {
          method: "DELETE",
          headers: { Cookie: cookie },
        });
        expect((await handleRemoveLibraryItem(req, mediaType, String(item.id))).status).toBe(200);
      } else {
        let result;
        if (mediaType === "movie")
          result = await removeMovieTool.execute("remove", { movieId: item.id });
        else result = await removeSeriesTool.execute("remove", { seriesId: item.id });
        expect(parseToolPayload(result)).toMatchObject({
          success: true,
          title: item.title,
          tmdbId: item.tmdbId,
        });
      }

      expect(state.deleted).toEqual([`/api/v3/${mediaType}/${item.id}`]);
      expect((await getLibraryIndex())[mediaType].has(item.tmdbId)).toBe(false);
      const removals = await db
        .select()
        .from(mediaRemovals)
        .where(inArray(mediaRemovals.tmdbId, [item.tmdbId]));
      expect(removals).toHaveLength(1);
      expect(removals[0]).toMatchObject({
        mediaType,
        tmdbId: item.tmdbId,
        title: item.title,
        deletedFiles: true,
        removedBy: source === "chat" ? "Kyle" : expect.stringContaining("Removal admin"),
      });
    });
  }
}

test("a failed deletion does not claim the title was removed", async () => {
  stubLibrary(true);
  await expect(removeMovieTool.execute("remove", { movieId: movie.id })).rejects.toThrow("offline");
  expect((await getLibraryIndex()).movie.has(movie.tmdbId)).toBe(true);
  expect(
    await db
      .select()
      .from(mediaRemovals)
      .where(inArray(mediaRemovals.tmdbId, [movie.tmdbId])),
  ).toEqual([]);
});
