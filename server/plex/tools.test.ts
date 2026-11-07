import { describe, expect, test } from "bun:test";
import type { Viewer } from "#server/people.ts";
import type { TitlePlay } from "./history.ts";
import { playedBy, watchedEntries } from "./tools.ts";

const viewer: Viewer = {
  userId: "user-1",
  name: "Jason",
  plexAccountId: "100",
  plexNames: new Map([["200", "Sam Smith"]]),
};

const jason = { accountId: "100", name: "jasonvh" };
const sam = { accountId: "200", name: "samplex" };

function episode(at: string, seasonNumber: number, episodeNumber: number): TitlePlay {
  return {
    person: sam,
    at,
    key: "series:95396",
    title: "Severance",
    episode: { seasonNumber, episodeNumber, title: `Episode ${episodeNumber}` },
  };
}

describe("playedBy", () => {
  test("finds someone by part of the name Kyle knows them by", () => {
    expect(playedBy(episode("2026-01-01T00:00:00.000Z", 1, 1), "sam", viewer)).toBe(true);
  });

  test("finds someone by their Plex name", () => {
    expect(playedBy(episode("2026-01-01T00:00:00.000Z", 1, 1), "SAMPLEX", viewer)).toBe(true);
  });

  test("passes over anyone else", () => {
    expect(playedBy(episode("2026-01-01T00:00:00.000Z", 1, 1), "jason", viewer)).toBe(false);
  });
});

describe("watchedEntries", () => {
  test("folds a binge into one entry with its distinct episodes and the latest", () => {
    const entries = watchedEntries(
      [
        episode("2026-01-03T00:00:00.000Z", 1, 2),
        episode("2026-01-02T00:00:00.000Z", 1, 1),
        episode("2026-01-01T00:00:00.000Z", 1, 1),
      ],
      viewer,
    );

    expect(entries).toEqual([
      {
        person: "Sam Smith",
        title: "Severance",
        mediaType: "series",
        link: expect.stringContaining("/media/series/95396"),
        plays: 3,
        episodes: 2,
        latestEpisode: "S01E02 Episode 2",
        firstWatchedAt: "2026-01-01T00:00:00.000Z",
        lastWatchedAt: "2026-01-03T00:00:00.000Z",
      },
    ]);
  });

  test("keeps each person apart and marks the asker", () => {
    const entries = watchedEntries(
      [
        { person: jason, at: "2026-01-02T00:00:00.000Z", key: "movie:550", title: "Fight Club" },
        { person: sam, at: "2026-01-01T00:00:00.000Z", key: "movie:550", title: "Fight Club" },
      ],
      viewer,
    );

    expect(entries.map(({ person, you, plays }) => ({ person, you, plays }))).toEqual([
      { person: "jasonvh", you: true, plays: 1 },
      { person: "Sam Smith", you: undefined, plays: 1 },
    ]);
    expect(entries[0]).not.toHaveProperty("episodes");
  });
});
