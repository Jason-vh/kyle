import { describe as group, expect, test } from "bun:test";
import { isFresh, type TmdbDescription } from "./description.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
const now = Date.parse("2026-09-27T12:00:00Z");
const daysAgo = (days: number) => new Date(now - days * DAY_MS);

function movie(releases: TmdbDescription["releases"]): TmdbDescription {
  return { title: "Arrival", posterPath: null, backdropPath: null, genres: [], releases };
}

const series: TmdbDescription = {
  title: "Severance",
  posterPath: null,
  backdropPath: null,
  genres: [],
};

group("isFresh", () => {
  test("keeps a series for a month", () => {
    expect(isFresh("series", series, daysAgo(29), now)).toBe(true);
    expect(isFresh("series", series, daysAgo(30), now)).toBe(false);
  });

  test("keeps a movie that is out at home for a month", () => {
    const out = movie({ cinema: "2026-05-01", digital: "2026-06-01" });
    expect(isFresh("movie", out, daysAgo(29), now)).toBe(true);
    expect(isFresh("movie", out, daysAgo(30), now)).toBe(false);
  });

  test("a physical release alone is out at home", () => {
    expect(isFresh("movie", movie({ physical: "2026-06-01" }), daysAgo(29), now)).toBe(true);
  });

  test.each([
    ["no home release yet", { cinema: "2026-09-01" }],
    ["a home release still to come", { cinema: "2026-09-01", digital: "2026-10-15" }],
    ["no release dates at all", {}],
  ])("rechecks a movie with %s after a day", (_, releases) => {
    expect(isFresh("movie", movie(releases), daysAgo(0.9), now)).toBe(true);
    expect(isFresh("movie", movie(releases), daysAgo(1), now)).toBe(false);
  });
});
