import { describe, expect, test } from "bun:test";
import { buildSeasons } from "./seasons.ts";
import type { SonarrEpisode, SonarrSeries } from "#server/sonarr/types.ts";

function series(seasonNumbers: number[]): SonarrSeries {
  return {
    id: 9,
    seasons: seasonNumbers.map((seasonNumber) => ({
      seasonNumber,
      monitored: true,
      statistics: { episodeCount: 2, episodeFileCount: 1, sizeOnDisk: 100 },
    })),
  } as unknown as SonarrSeries;
}

function episode(seasonNumber: number, episodeNumber: number, overrides = {}): SonarrEpisode {
  return {
    seasonNumber,
    episodeNumber,
    title: `Episode ${episodeNumber}`,
    hasFile: true,
    monitored: true,
    ...overrides,
  } as unknown as SonarrEpisode;
}

describe("buildSeasons", () => {
  test("puts each episode under its own season, in order", () => {
    const seasons = buildSeasons(series([1, 2]), [
      episode(2, 1),
      episode(1, 2),
      episode(1, 1),
      episode(2, 2),
    ]);

    expect(seasons.map((s) => s.seasonNumber)).toEqual([1, 2]);
    expect(seasons[0]?.episodes.map((e) => e.episodeNumber)).toEqual([1, 2]);
    expect(seasons[1]?.episodes.map((e) => e.episodeNumber)).toEqual([1, 2]);
  });

  // Season 0 is where Sonarr files specials, and nobody reads it as the first one.
  test("sorts specials last", () => {
    const seasons = buildSeasons(series([0, 2, 1]), []);

    expect(seasons.map((s) => s.seasonNumber)).toEqual([1, 2, 0]);
  });

  // Counting the episodes would report a season that has not finished airing as
  // complete, because Sonarr only lists what exists.
  test("takes the totals from Sonarr rather than counting episodes", () => {
    const [season] = buildSeasons(series([1]), [episode(1, 1)]);

    expect(season?.episodeCount).toBe(2);
    expect(season?.episodeFileCount).toBe(1);
    expect(season?.sizeOnDisk).toBe(100);
  });

  test("a season Sonarr has no statistics for reads as empty, not as missing", () => {
    const bare = {
      id: 9,
      seasons: [{ seasonNumber: 1, monitored: false }],
    } as unknown as SonarrSeries;

    const [season] = buildSeasons(bare, [episode(1, 1)]);

    expect(season?.episodeCount).toBe(0);
    expect(season?.episodes).toHaveLength(1);
  });

  test("prefers the precise air time over the date alone", () => {
    const [season] = buildSeasons(series([1]), [
      episode(1, 1, { airDate: "2022-02-18", airDateUtc: "2022-02-18T05:00:00Z" }),
    ]);

    expect(season?.episodes[0]?.airDate).toBe("2022-02-18T05:00:00Z");
  });

  test("an episode Sonarr lists under no known season is left out", () => {
    const seasons = buildSeasons(series([1]), [episode(1, 1), episode(7, 1)]);

    expect(seasons).toHaveLength(1);
  });
});
