import { expect, test } from "bun:test";
import { describeToolCall, describeToolDetails, isActionTool } from "./tool-display.ts";
import { bulletList } from "./tool-result.ts";

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
    describeToolCall(
      "add_movie",
      { tmdbId: 27205 },
      { title: "Inception", year: 2010, alreadyInLibrary: true },
    ),
  ).toBe("Inception (2010) was already in Radarr");
  expect(
    describeToolCall("add_series", { tvdbId: 1 }, { series: { title: "Severance", year: 2022 } }),
  ).toBe("Added Severance (2022) to Sonarr");
  expect(
    describeToolCall(
      "add_series",
      { tvdbId: 1 },
      { series: { title: "Severance", year: 2022 }, alreadyInLibrary: true },
    ),
  ).toBe("Severance (2022) was already in Sonarr");
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

test("a long list is cut short, saying how many it left out", () => {
  expect(bulletList(["a", "b"])).toBe("- a\n- b");
  expect(bulletList(["a", "b", "c"], 2)).toBe("- a\n- b\n- and 1 more");
});

test("details say what the one-line description has no room for", () => {
  expect(
    describeToolDetails(
      "delete_torrents",
      { hashes: ["a", "b"] },
      { names: ["Dune.2021.2160p", "Severance.S02"], deletedFiles: true },
    ),
  ).toBe("Their files were deleted too.\n- Dune.2021.2160p\n- Severance.S02");
  expect(
    describeToolDetails("add_series", { tvdbId: 1, seasons: [1, 2] }, { following: true }),
  ).toBe("Downloading seasons 1, 2\nFollowing it for new seasons");
  expect(describeToolDetails("add_series", { tvdbId: 1 }, { following: false })).toBe(
    "Downloading every regular season\nNot following new seasons",
  );
  expect(describeToolDetails("remove_season", { seasonNumber: 2 }, { filesDeleted: 1 })).toBe(
    "Deleted 1 file from disk",
  );
  expect(describeToolDetails("request_season", {}, { alreadyMonitored: true })).toBe(
    "It was already monitored, so this searches for it again",
  );
  expect(
    describeToolDetails(
      "download_episodes",
      { seriesId: 1, seasonNumber: 3 },
      { monitoringActions: ["Monitored season 3 on Dark", "Monitored 8 episodes"] },
    ),
  ).toBe("Monitored season 3 on Dark\nMonitored 8 episodes");
  expect(
    describeToolDetails(
      "manual_import",
      { downloadId: "x", importAll: true },
      { importedFiles: [{ episodes: ["S01E01", "S01E02"] }], skippedFiles: 1 },
    ),
  ).toBe("Skipped 1 file\n- S01E01, S01E02");
});

test("details are left out when there is nothing to add", () => {
  expect(describeToolDetails("add_movie", { tmdbId: 1 }, { title: "Dune" })).toBeUndefined();
  expect(describeToolDetails("request_season", {}, { alreadyMonitored: false })).toBeUndefined();
  expect(describeToolDetails("delete_torrents", { hashes: ["a"] })).toBeUndefined();
  expect(describeToolDetails("download_episodes", { seriesId: 1 }, {})).toBeUndefined();
});
