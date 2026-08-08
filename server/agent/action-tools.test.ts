import { expect, test } from "bun:test";
import { isActionTool } from "./action-tools.ts";

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
