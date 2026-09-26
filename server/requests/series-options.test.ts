import { describe, expect, test } from "bun:test";
import { seasonOptions } from "./series-options.ts";
import type { SonarrSeries } from "#server/sonarr/types.ts";
import type { TMDBTVSeason } from "#server/tmdb/types.ts";

function series(seasonNumbers: number[]): SonarrSeries {
  return {
    seasons: seasonNumbers.map((seasonNumber) => ({ seasonNumber, monitored: true })),
  } as SonarrSeries;
}

function tmdbSeason(season_number: number, episode_count: number, air_date: string | null) {
  return { season_number, episode_count, air_date } as TMDBTVSeason;
}

describe("seasonOptions", () => {
  test("offers Sonarr's seasons in order, specials last", () => {
    const options = seasonOptions(series([2, 0, 1]), []);

    expect(options.map((option) => option.seasonNumber)).toEqual([1, 2, 0]);
  });

  test("describes each season by what TMDB knows of the same number", () => {
    const [first] = seasonOptions(series([1]), [tmdbSeason(1, 9, "2022-02-18")]);

    expect(first).toEqual({ seasonNumber: 1, episodeCount: 9, year: 2022 });
  });

  // TMDB and TVDB number seasons independently; a season only one of them
  // has is offered all the same, just without the detail.
  test("offers a season TMDB does not number, without detail", () => {
    const [first] = seasonOptions(series([2024]), [tmdbSeason(1, 9, "2022-02-18")]);

    expect(first).toEqual({ seasonNumber: 2024, episodeCount: undefined, year: undefined });
  });

  test("offers only what Sonarr has, since that is what a request is made in", () => {
    const options = seasonOptions(series([1]), [tmdbSeason(1, 9, null), tmdbSeason(2, 8, null)]);

    expect(options).toHaveLength(1);
  });
});
