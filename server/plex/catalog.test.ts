import { describe, expect, test } from "bun:test";
import { plexWebUrl, tmdbIdOf } from "./catalog.ts";

describe("tmdbIdOf", () => {
  test("reads a TMDB guid", () => {
    expect(tmdbIdOf({ Guid: [{ id: "tmdb://27205" }, { id: "imdb://tt1375666" }] })).toBe(27205);
  });

  test("says nothing for a title Plex matched to no TMDB id", () => {
    expect(tmdbIdOf({ Guid: [{ id: "imdb://tt1375666" }] })).toBeUndefined();
    expect(tmdbIdOf({})).toBeUndefined();
  });
});

describe("plexWebUrl", () => {
  test("opens the title in Plex's own web app", () => {
    expect(plexWebUrl("machine-1", "16758")).toBe(
      "https://app.plex.tv/desktop/#!/server/machine-1/details?key=%2Flibrary%2Fmetadata%2F16758",
    );
  });
});
