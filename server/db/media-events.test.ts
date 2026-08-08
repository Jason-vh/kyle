import { expect, test } from "bun:test";
import { mediaEventUrl } from "./media-events.ts";

test("prefers IMDB, falls back to TMDB by media type", () => {
  expect(
    mediaEventUrl({ action: "add", mediaType: "movie", title: "x", ids: { imdb: "tt1", tmdb: 9 } }),
  ).toBe("https://www.imdb.com/title/tt1");
  expect(mediaEventUrl({ action: "add", mediaType: "movie", title: "x", ids: { tmdb: 9 } })).toBe(
    "https://www.themoviedb.org/movie/9",
  );
  expect(mediaEventUrl({ action: "add", mediaType: "series", title: "x", ids: { tmdb: 9 } })).toBe(
    "https://www.themoviedb.org/tv/9",
  );
});

test("no link without usable ids", () => {
  expect(
    mediaEventUrl({ action: "download", mediaType: "series", title: "x", ids: { sonarr: 3 } }),
  ).toBeUndefined();
});
