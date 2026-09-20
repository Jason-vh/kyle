import { describe, expect, test } from "bun:test";
import { movieEntry, seasonEntry, seriesEntry } from "./library.ts";
import type { RadarrMovie } from "#server/radarr/types.ts";
import type { SonarrSeason, SonarrSeries, SonarrStatistics } from "#server/sonarr/types.ts";

const NOW = new Date("2026-09-20");

function movie(overrides: Partial<RadarrMovie>): RadarrMovie {
  return {
    id: 7,
    monitored: true,
    hasFile: false,
    isAvailable: true,
    status: "released",
    digitalRelease: "2024-03-01",
    ...overrides,
  } as unknown as RadarrMovie;
}

function series(overrides: Partial<SonarrSeries>): SonarrSeries {
  return { id: 9, monitored: true, ...overrides } as unknown as SonarrSeries;
}

function season(
  seasonNumber: number,
  episodeCount: number,
  episodeFileCount: number,
  monitored = true,
): SonarrSeason {
  return {
    seasonNumber,
    monitored,
    images: [],
    statistics: {
      episodeCount,
      episodeFileCount,
      totalEpisodeCount: episodeCount,
      sizeOnDisk: 0,
      percentOfEpisodes: 0,
    },
  };
}

function statistics(episodeCount: number, episodeFileCount: number): SonarrStatistics {
  return {
    seasonCount: 1,
    episodeCount,
    episodeFileCount,
    totalEpisodeCount: episodeCount,
    sizeOnDisk: 0,
    percentOfEpisodes: 0,
  };
}

describe("movieEntry", () => {
  test("a film Radarr can already search for is waiting for nothing", () => {
    expect(movieEntry(movie({}), NOW)).toEqual({
      serviceId: 7,
      monitored: true,
      hasFiles: false,
      complete: false,
      awaiting: undefined,
    });
  });

  test("an announced film is unreleased, dated by its first showing anywhere", () => {
    const entry = movieEntry(
      movie({ status: "announced", inCinemas: "2026-12-06", digitalRelease: "2027-06-01" }),
      NOW,
    );

    expect(entry.awaiting).toEqual({ reason: "unreleased", expectedAt: "2026-12-06" });
  });

  // Radarr searches for it regardless once minimum availability is `announced`.
  test("an announced film with no dates at all is still unreleased", () => {
    const entry = movieEntry(
      movie({ status: "announced", isAvailable: true, digitalRelease: undefined }),
      NOW,
    );

    expect(entry.awaiting).toEqual({ reason: "unreleased", expectedAt: undefined });
  });

  // Out, but not in a form we can fetch — the state "Looking" used to hide.
  test("a film in cinemas waits for its digital release", () => {
    const entry = movieEntry(movie({ status: "inCinemas", digitalRelease: "2026-12-01" }), NOW);

    expect(entry.awaiting).toEqual({ reason: "waiting", expectedAt: "2026-12-01" });
  });

  test("a released film whose digital date is still ahead is waiting, not searching", () => {
    expect(movieEntry(movie({ digitalRelease: "2026-11-04" }), NOW).awaiting).toEqual({
      reason: "waiting",
      expectedAt: "2026-11-04",
    });
  });

  test("a film on disk is complete, whatever the calendar says", () => {
    const entry = movieEntry(movie({ hasFile: true, status: "announced" }), NOW);

    expect(entry).toMatchObject({ hasFiles: true, complete: true, awaiting: undefined });
  });
});

describe("seasonEntry", () => {
  // Ownership is per season, so each season has to answer for itself rather
  // than inherit whatever the series around it happens to be doing.
  test("a season complete on disk is complete, in a series that is not", () => {
    const show = series({ statistics: statistics(30, 22), seasons: [season(1, 22, 22)] });

    expect(seasonEntry(show, show.seasons[0]!)).toMatchObject({
      serviceId: 9,
      hasFiles: true,
      complete: true,
      missing: undefined,
    });
  });

  test("a season short of episodes names itself as what is missing", () => {
    const show = series({ seasons: [season(4, 8, 6)] });

    expect(seasonEntry(show, show.seasons[0]!)).toMatchObject({
      complete: false,
      missing: [{ season: 4, episodes: 2 }],
    });
  });

  test("a season nobody monitors is paused rather than missing", () => {
    const show = series({ seasons: [season(3, 10, 0, false)] });

    expect(seasonEntry(show, show.seasons[0]!).monitored).toBe(false);
  });

  test("a season with nothing aired yet is unreleased, dated by the next airing", () => {
    const show = series({ nextAiring: "2027-01-14", seasons: [season(5, 0, 0)] });

    expect(seasonEntry(show, show.seasons[0]!).awaiting).toEqual({
      reason: "unreleased",
      expectedAt: "2027-01-14",
    });
  });
});

describe("seriesEntry", () => {
  test("carries an entry for every season, so a season request can be answered", () => {
    const entry = seriesEntry(
      series({ statistics: statistics(30, 22), seasons: [season(1, 22, 22), season(2, 8, 0)] }),
    );

    expect(entry.seasons?.get(1)).toMatchObject({ complete: true });
    expect(entry.seasons?.get(2)).toMatchObject({ hasFiles: false, complete: false });
  });

  test("every aired episode on disk is complete", () => {
    const entry = seriesEntry(
      series({ statistics: statistics(10, 10), seasons: [season(1, 10, 10)] }),
    );

    expect(entry).toMatchObject({ hasFiles: true, complete: true, missing: undefined });
  });

  // 28 of 30 episodes reads as a whole series until the season is named.
  test("a long-runner short of one season names the season", () => {
    const entry = seriesEntry(
      series({
        statistics: statistics(30, 28),
        seasons: [season(1, 22, 22), season(4, 8, 6)],
      }),
    );

    expect(entry).toMatchObject({
      hasFiles: true,
      complete: false,
      missing: [{ season: 4, episodes: 2 }],
    });
  });

  test("seasons nobody monitors, and specials, are nobody's concern", () => {
    const entry = seriesEntry(
      series({
        statistics: statistics(30, 20),
        seasons: [season(0, 5, 0), season(1, 10, 10), season(2, 10, 0, false)],
      }),
    );

    expect(entry).toMatchObject({ complete: true, missing: undefined });
  });

  test("a series with nothing aired yet is unreleased, dated by its next airing", () => {
    const entry = seriesEntry(
      series({
        nextAiring: "2026-01-08T01:00:00Z",
        firstAired: "2026-01-08",
        statistics: statistics(0, 0),
      }),
    );

    expect(entry.awaiting).toEqual({ reason: "unreleased", expectedAt: "2026-01-08T01:00:00Z" });
  });

  test("a series the service reports nothing about is treated as unaired", () => {
    expect(seriesEntry(series({})).awaiting).toEqual({
      reason: "unreleased",
      expectedAt: undefined,
    });
  });
});
