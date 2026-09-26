import { afterEach, describe, expect, test } from "bun:test";
import { clearRemoval, getRemoval, getRemovals, recordRemoval } from "./removals.ts";
import { db } from "./index.ts";
import { mediaRemovals } from "./schema.ts";

afterEach(async () => {
  await db.delete(mediaRemovals);
});

describe("removals", () => {
  test("remembers who took a title out, and when", async () => {
    await recordRemoval({
      mediaType: "movie",
      tmdbId: 27205,
      title: "Inception",
      removedBy: "Jason",
      deletedFiles: true,
    });

    const removal = (await getRemovals()).get("movie:27205");

    expect(removal).toMatchObject({ removedBy: "Jason", deletedFiles: true });
    expect(removal?.at).toBeInstanceOf(Date);
  });

  // Removed by something other than Kyle: the date is all we can honestly say.
  test("records a removal nobody can be named for", async () => {
    await recordRemoval({
      mediaType: "series",
      tmdbId: 95396,
      title: "Severance",
      deletedFiles: false,
    });

    expect((await getRemovals()).get("series:95396")).toMatchObject({ removedBy: null });
  });

  test("a second removal replaces the first rather than piling up", async () => {
    const removal = { mediaType: "movie", tmdbId: 27205, title: "Inception" } as const;

    await recordRemoval({ ...removal, removedBy: "Jason", deletedFiles: true });
    await recordRemoval({ ...removal, removedBy: "Sam", deletedFiles: false });

    const removals = await getRemovals();
    expect(removals.size).toBe(1);
    expect(removals.get("movie:27205")).toMatchObject({ removedBy: "Sam", deletedFiles: false });
  });

  // Asking for it again makes how it once left the wrong answer.
  test("forgets a removal once the title is wanted again", async () => {
    await recordRemoval({
      mediaType: "movie",
      tmdbId: 27205,
      title: "Inception",
      deletedFiles: true,
    });
    await clearRemoval("movie", 27205);

    expect((await getRemovals()).size).toBe(0);
  });

  test("reads one title's removal, and only that title's", async () => {
    await recordRemoval({
      mediaType: "movie",
      tmdbId: 27205,
      title: "Inception",
      removedBy: "Jason",
      deletedFiles: true,
    });

    expect(await getRemoval("movie", 27205)).toMatchObject({ removedBy: "Jason" });
    expect(await getRemoval("series", 27205)).toBeUndefined();
  });
});
