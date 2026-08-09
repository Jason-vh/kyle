import { expect, test } from "bun:test";
import { describeToolCall, isActionTool } from "./tool-display.ts";

test("library changes are actions", () => {
  for (const tool of ["add_movie", "remove_series", "remove_season", "download_episodes"]) {
    expect(isActionTool(tool)).toBe(true);
  }
});

test("lookups are not actions", () => {
  for (const tool of ["get_all_movies", "search_movies", "get_calendar", "web_search"]) {
    expect(isActionTool(tool)).toBe(false);
  }
});

test("manual_import counts only when it actually imports", () => {
  expect(isActionTool("manual_import", { downloadId: "abc" })).toBe(false);
  expect(isActionTool("manual_import", { downloadId: "abc", importAll: true })).toBe(true);
});

test("a finished action names what it acted on", () => {
  expect(describeToolCall("remove_movie", { movieId: 7 }, { title: "Inception", year: 2010 })).toBe(
    "Removed Inception (2010) from Radarr",
  );
  expect(describeToolCall("add_movie", { tmdbId: 27205 }, { title: "Inception", year: 2010 })).toBe(
    "Added Inception (2010) to Radarr",
  );
  expect(
    describeToolCall("add_series", { tvdbId: 1 }, { series: { title: "Severance", year: 2022 } }),
  ).toBe("Added Severance (2022) to Sonarr");
  expect(
    describeToolCall("remove_season", { seriesId: 1, seasonNumber: 2 }, { title: "Severance" }),
  ).toBe("Removed Severance season 2 from Sonarr");
  expect(
    describeToolCall(
      "download_episodes",
      { seriesId: 1, seasonNumber: 3 },
      { seriesTitle: "Dark" },
    ),
  ).toBe("Started downloading Dark season 3");
  expect(describeToolCall("delete_torrents", { hashes: ["a", "b"] })).toBe(
    "Deleted 2 torrents from qBittorrent",
  );
});

test("a call with no result still reads sensibly", () => {
  expect(describeToolCall("remove_movie", { movieId: 7 })).toBe("Removed movie from Radarr");
  expect(describeToolCall("add_series", { tvdbId: 1 })).toBe("Added series to Sonarr");
  expect(describeToolCall("download_episodes", { seriesId: 1 })).toBe(
    "Started downloading missing episodes",
  );
  expect(describeToolCall("unsubscribe_notifications", { userId: "u" })).toBe(
    "Unsubscribed from notifications",
  );
});
