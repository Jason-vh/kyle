import { describe, expect, test } from "bun:test";
import { buildSeasons, withEpisodeWatchers, type SeasonContext } from "./seasons.ts";
import type { SonarrEpisode, SonarrSeries } from "#server/sonarr/types.ts";
import { episodeWatchKey, watchKey } from "#server/plex/history.ts";
import type { Watcher } from "#shared/types.ts";

/** Nobody asked for anything and nothing is downloading, unless a test says so. */
function build(
  series: SonarrSeries,
  episodes: SonarrEpisode[],
  context: Partial<SeasonContext> = {},
) {
  return buildSeasons(series, episodes, {
    requestedBy: new Map(),
    queues: new Map(),
    plex: { reachable: false },
    ...context,
  });
}

const DAY = 24 * 60 * 60 * 1000;
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString();

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
    const seasons = build(series([1, 2]), [
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
    const seasons = build(series([0, 2, 1]), []);

    expect(seasons.map((s) => s.seasonNumber)).toEqual([1, 2, 0]);
  });

  // Counting the episodes would report a season that has not finished airing as
  // complete, because Sonarr only lists what exists.
  test("takes the totals from Sonarr rather than counting episodes", () => {
    const [season] = build(series([1]), [episode(1, 1)]);

    expect(season?.episodeCount).toBe(2);
    expect(season?.episodeFileCount).toBe(1);
    expect(season?.sizeOnDisk).toBe(100);
  });

  test("a season Sonarr has no statistics for reads as empty, not as missing", () => {
    const bare = {
      id: 9,
      seasons: [{ seasonNumber: 1, monitored: false }],
    } as unknown as SonarrSeries;

    const [season] = build(bare, [episode(1, 1)]);

    expect(season?.episodeCount).toBe(0);
    expect(season?.episodes).toHaveLength(1);
  });

  test("prefers the precise air time over the date alone", () => {
    const [season] = build(series([1]), [
      episode(1, 1, { airDate: "2022-02-18", airDateUtc: "2022-02-18T05:00:00Z" }),
    ]);

    expect(season?.episodes[0]?.airDate).toBe("2022-02-18T05:00:00Z");
  });

  test("an episode Sonarr lists under no known season is left out", () => {
    const seasons = build(series([1]), [episode(1, 1), episode(7, 1)]);

    expect(seasons).toHaveLength(1);
  });
});

describe("season state", () => {
  function counted(episodeCount: number, episodeFileCount: number, monitored = true) {
    return {
      id: 9,
      seasons: [{ seasonNumber: 1, monitored, statistics: { episodeCount, episodeFileCount } }],
    } as unknown as SonarrSeries;
  }

  const aired = (episodeNumber: number, hasFile: boolean) =>
    episode(1, episodeNumber, { hasFile, airDate: iso(-30) });

  test("every aired episode on disk is ready", () => {
    const [season] = build(counted(2, 2), [aired(1, true), aired(2, true)]);

    expect(season?.state).toBe("ready");
  });

  // The case the request button exists for: Sonarr is not watching this and
  // nobody asked, so it is not late, it was never coming.
  test("a season nobody asked for and nothing watches is unrequested", () => {
    const [season] = build(counted(2, 0, false), [aired(1, false), aired(2, false)]);

    expect(season?.state).toBe("unrequested");
  });

  // Once someone has asked, the same season is late rather than unwanted.
  test("the same season, once someone has asked for it, is being looked for", () => {
    const [season] = build(counted(2, 0, false), [aired(1, false), aired(2, false)], {
      requestedBy: new Map([[1, ["Jason"]]]),
    });

    expect(season?.state).toBe("paused");
    expect(season?.requestedBy).toEqual(["Jason"]);
  });

  test("a monitored season with nothing to show for it is searching", () => {
    const [season] = build(counted(2, 0), [aired(1, false), aired(2, false)]);

    expect(season?.state).toBe("searching");
  });

  // Up to date is not finished: the rest of the season has not aired.
  test("a season up to date with a broadcast still running is airing", () => {
    const thursday = iso(7);
    const [season] = build(counted(2, 2), [
      aired(1, true),
      aired(2, true),
      episode(1, 3, { hasFile: false, airDate: thursday }),
    ]);

    expect(season?.state).toBe("airing");
    expect(season?.expectedAt).toBe(thursday);
  });

  test("a season whose first episode is still to come says when it starts", () => {
    const march = iso(120);
    const [season] = build(counted(0, 0), [episode(1, 1, { hasFile: false, airDate: march })]);

    expect(season?.state).toBe("unreleased");
    expect(season?.expectedAt).toBe(march);
  });

  test("what the queue is doing beats what is on disk", () => {
    const [season] = build(counted(2, 0), [aired(1, false), aired(2, false)], {
      queues: new Map([[1, { state: "downloading" as const, progress: 0.4, eta: "00:10:00" }]]),
    });

    expect(season?.state).toBe("downloading");
    expect(season?.progress).toBe(0.4);
    expect(season?.eta).toBe("00:10:00");
  });

  test("a season Sonarr counts no episodes in has nothing to show yet", () => {
    const [season] = build(counted(0, 0, false), []);

    expect(season?.state).toBe("unrequested");
  });
});

describe("withEpisodeWatchers", () => {
  const GIRLS = watchKey("series", 1220);
  const jason: Watcher = { name: "Jason" };

  test("gives each episode only the people who watched that episode", () => {
    const seasons = build(series([1]), [episode(1, 1), episode(1, 2)]);
    const watchers = new Map([[episodeWatchKey(GIRLS, 1, 2), [jason]]]);

    const [season] = withEpisodeWatchers(seasons, GIRLS, watchers);

    expect(season?.episodes[0]?.watchedBy).toEqual([]);
    expect(season?.episodes[1]?.watchedBy).toEqual([jason]);
  });

  test("does not carry one series' history onto another", () => {
    const seasons = build(series([1]), [episode(1, 1)]);
    const watchers = new Map([[episodeWatchKey(watchKey("series", 75219), 1, 1), [jason]]]);

    const [season] = withEpisodeWatchers(seasons, GIRLS, watchers);

    expect(season?.episodes[0]?.watchedBy).toEqual([]);
  });

  test("leaves the rest of the season as it was", () => {
    const seasons = build(series([1]), [episode(1, 1)]);

    const [season] = withEpisodeWatchers(seasons, GIRLS, new Map());

    expect(season?.episodeCount).toBe(2);
    expect(season?.episodes[0]?.title).toBe("Episode 1");
  });
});
