import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "#server/db/index.ts";
import { tmdbArtwork } from "#server/db/schema.ts";
import { attachPosters, getPosters } from "./artwork.ts";

const realFetch = globalThis.fetch;
const previousToken = process.env.TMDB_API_TOKEN;
let calls: string[] = [];

beforeAll(() => {
  process.env.TMDB_API_TOKEN = "test-only";
});

afterEach(async () => {
  globalThis.fetch = realFetch;
  calls = [];
  await db.delete(tmdbArtwork);
});

afterAll(() => {
  if (previousToken === undefined) delete process.env.TMDB_API_TOKEN;
  else process.env.TMDB_API_TOKEN = previousToken;
});

function stubTmdb(posters: Record<string, string>) {
  globalThis.fetch = (async (url: string) => {
    calls.push(url);
    const path = Object.keys(posters).find((suffix) => url.endsWith(suffix));
    if (path) return Response.json({ poster_path: posters[path], backdrop_path: null });
    return Response.json({ status_message: "not found" }, { status: 404 });
  }) as unknown as typeof fetch;
}

describe("getPosters", () => {
  test("asks TMDB once per title, then answers from what it kept", async () => {
    stubTmdb({ "/movie/27205": "/inception.jpg", "/tv/95396": "/severance.jpg" });
    const refs = [
      { mediaType: "movie" as const, tmdbId: 27205 },
      { mediaType: "series" as const, tmdbId: 95396 },
    ];

    const first = await getPosters(refs);
    const second = await getPosters(refs);

    expect(first.get("movie:27205")).toBe("/inception.jpg");
    expect(first.get("series:95396")).toBe("/severance.jpg");
    expect(second).toEqual(first);
    expect(calls).toHaveLength(2);
  });

  test("remembers a title TMDB does not know, rather than asking again", async () => {
    stubTmdb({});
    await getPosters([{ mediaType: "movie", tmdbId: 1 }]);
    await getPosters([{ mediaType: "movie", tmdbId: 1 }]);

    expect(calls).toHaveLength(1);
    const [row] = await db.select().from(tmdbArtwork).where(eq(tmdbArtwork.tmdbId, 1));
    expect(row?.posterPath).toBeNull();
  });

  test("asks again about a title once it is a month old", async () => {
    stubTmdb({ "/movie/27205": "/new.jpg" });
    await db.insert(tmdbArtwork).values({
      mediaType: "movie",
      tmdbId: 27205,
      posterPath: "/old.jpg",
      fetchedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
    });

    const posters = await getPosters([{ mediaType: "movie", tmdbId: 27205 }]);
    expect(posters.get("movie:27205")).toBe("/old.jpg");

    await new Promise((resolve) => setTimeout(resolve, 20));
    const [row] = await db.select().from(tmdbArtwork).where(eq(tmdbArtwork.tmdbId, 27205));
    expect(row?.posterPath).toBe("/new.jpg");
  });
});

describe("attachPosters", () => {
  test("gives each item its poster, leaving items without a TMDB id alone", async () => {
    stubTmdb({ "/movie/27205": "/inception.jpg" });
    const items = [
      { mediaType: "movie" as const, tmdbId: 27205, posterPath: undefined as string | undefined },
      { mediaType: "series" as const, posterPath: undefined as string | undefined },
    ];

    await attachPosters(items);

    expect(items.map((item) => item.posterPath)).toEqual(["/inception.jpg", undefined]);
  });
});
