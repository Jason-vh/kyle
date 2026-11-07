import { describe, expect, test } from "bun:test";
import { earliestReleases, toPartialMovieDetails } from "./utils.ts";
import type { TMDBCountryReleases, TMDBMovieDetails } from "./types.ts";

function movieReleasedAs(results: TMDBCountryReleases[]): TMDBMovieDetails {
  return { release_dates: { results } } as TMDBMovieDetails;
}

function release(type: number, date: string) {
  return { type, release_date: `${date}T00:00:00.000Z`, note: "", certification: "" };
}

test("each kind of release takes its earliest date across countries", () => {
  const movie = movieReleasedAs([
    { iso_3166_1: "US", release_dates: [release(3, "2026-09-25"), release(4, "2026-11-10")] },
    { iso_3166_1: "RO", release_dates: [release(2, "2026-09-19")] },
    { iso_3166_1: "ES", release_dates: [release(1, "2026-09-22"), release(5, "2026-12-01")] },
    { iso_3166_1: "GB", release_dates: [release(4, "2026-11-03"), release(6, "2027-03-01")] },
  ]);

  expect(earliestReleases(movie)).toEqual({
    premiere: "2026-09-22",
    cinema: "2026-09-19",
    digital: "2026-11-03",
    physical: "2026-12-01",
    tv: "2027-03-01",
  });
});

test("a film only in cinemas has no digital or physical release", () => {
  const movie = movieReleasedAs([{ iso_3166_1: "NL", release_dates: [release(3, "2026-09-24")] }]);

  expect(earliestReleases(movie)).toMatchObject({ digital: null, physical: null });
});

test("unknown release types and missing release data are ignored", () => {
  const movie = movieReleasedAs([{ iso_3166_1: "NL", release_dates: [release(9, "2026-09-24")] }]);

  expect(Object.values(earliestReleases(movie)).every((date) => date === null)).toBe(true);
  expect(earliestReleases({} as TMDBMovieDetails).cinema).toBeNull();
});

describe("movie details as the agent sees them", () => {
  // Heart of the Beast on November 7: in cinemas for weeks, digital still three days off.
  const movie = {
    ...movieReleasedAs([
      { iso_3166_1: "US", release_dates: [release(3, "2026-09-19"), release(4, "2026-11-10")] },
    ]),
    genres: [],
    production_companies: [],
  } as unknown as TMDBMovieDetails;

  test("each release says how far it is from today", () => {
    expect(toPartialMovieDetails(movie, "2026-11-07").releases).toMatchObject({
      cinema: { date: "2026-09-19", when: "49 days ago" },
      digital: { date: "2026-11-10", when: "in 3 days" },
      physical: null,
    });
  });

  test("a film only in cinemas is not out at home until its digital release", () => {
    expect(toPartialMovieDetails(movie, "2026-11-07").outAtHome).toBe(false);
    expect(toPartialMovieDetails(movie, "2026-11-10").outAtHome).toBe(true);
  });
});
