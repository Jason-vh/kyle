import { describe, expect, test } from "bun:test";
import { resolveHistoryKey, watchKey, type TitleIndex } from "./history.ts";

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
