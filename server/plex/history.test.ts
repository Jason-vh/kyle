import { describe, expect, test } from "bun:test";
import {
  episodeWatchKey,
  resolveEpisodeKey,
  resolveHistoryKey,
  watchKey,
  type TitleIndex,
} from "./history.ts";

const MOVIES = "1";
const SHOWS = "2";

const index: TitleIndex = {
  byRatingKey: new Map([
    ["14026", watchKey("series", 75219)],
    ["15682", watchKey("movie", 9880)],
  ]),
  byTitle: new Map([
    [`${SHOWS}:9-1-1`, watchKey("series", 75219)],
    [`${SHOWS}:girls`, watchKey("series", 1220)],
    [`${MOVIES}:the princess diaries`, watchKey("movie", 9880)],
  ]),
};

describe("resolveHistoryKey", () => {
  test("resolves an episode through its series path", () => {
    const key = resolveHistoryKey(
      { type: "episode", accountID: 1, grandparentKey: "/library/metadata/14026" },
      index,
    );

    expect(key).toBe("series:75219");
  });

  test("resolves a movie through its rating key", () => {
    expect(resolveHistoryKey({ type: "movie", accountID: 1, ratingKey: "15682" }, index)).toBe(
      "movie:9880",
    );
  });

  // Deleting an episode file strips the ids from its history rows, which is
  // most of the history on a server where watched episodes are cleaned up.
  test("falls back to the series title when the ids are gone", () => {
    const key = resolveHistoryKey(
      {
        type: "episode",
        accountID: 1,
        grandparentKey: null,
        grandparentTitle: "Girls",
        librarySectionID: SHOWS,
      },
      index,
    );

    expect(key).toBe("series:1220");
  });

  test("falls back to the title for a deleted movie", () => {
    const key = resolveHistoryKey(
      {
        type: "movie",
        accountID: 1,
        ratingKey: null,
        title: "The Princess Diaries",
        librarySectionID: MOVIES,
      },
      index,
    );

    expect(key).toBe("movie:9880");
  });

  test("matches a title regardless of case", () => {
    const key = resolveHistoryKey(
      { type: "episode", accountID: 1, grandparentTitle: "GIRLS", librarySectionID: SHOWS },
      index,
    );

    expect(key).toBe("series:1220");
  });

  test("does not match a title from another section", () => {
    const key = resolveHistoryKey(
      { type: "episode", accountID: 1, grandparentTitle: "Girls", librarySectionID: MOVIES },
      index,
    );

    expect(key).toBeUndefined();
  });

  test("gives up on a row naming nothing in the library", () => {
    const key = resolveHistoryKey(
      { type: "episode", accountID: 1, grandparentTitle: "Long Gone", librarySectionID: SHOWS },
      index,
    );

    expect(key).toBeUndefined();
  });

  test("prefers the id over the title when both are present", () => {
    const key = resolveHistoryKey(
      {
        type: "episode",
        accountID: 1,
        grandparentKey: "/library/metadata/14026",
        grandparentTitle: "Girls",
        librarySectionID: SHOWS,
      },
      index,
    );

    expect(key).toBe("series:75219");
  });
});

describe("resolveEpisodeKey", () => {
  const GIRLS = watchKey("series", 1220);

  // Most episode rows have lost their ids, so the numbers are the only link left.
  test("places an episode whose ids are gone", () => {
    const key = resolveEpisodeKey(
      { type: "episode", accountID: 1, grandparentTitle: "Girls", index: 10, parentIndex: 6 },
      GIRLS,
    );

    expect(key).toBe("series:1220:6:10");
  });

  test("places a special, which Plex numbers as season 0", () => {
    const key = resolveEpisodeKey(
      { type: "episode", accountID: 1, index: 1, parentIndex: 0 },
      GIRLS,
    );

    expect(key).toBe("series:1220:0:1");
  });

  test("ignores a movie, which has no episode to place", () => {
    expect(
      resolveEpisodeKey({ type: "movie", accountID: 1 }, watchKey("movie", 9880)),
    ).toBeUndefined();
  });

  test("gives up on an episode row missing its numbers", () => {
    expect(resolveEpisodeKey({ type: "episode", accountID: 1, index: 3 }, GIRLS)).toBeUndefined();
  });
});

describe("episodeWatchKey", () => {
  test("names one episode under its series", () => {
    expect(episodeWatchKey(watchKey("series", 1220), 6, 10)).toBe("series:1220:6:10");
  });

  test("keeps specials apart from the first season", () => {
    const specials = episodeWatchKey(watchKey("series", 1220), 0, 1);

    expect(specials).not.toBe(episodeWatchKey(watchKey("series", 1220), 1, 1));
  });
});
