import { describe, expect, test } from "bun:test";
import { resolveState, scopeOf } from "./state.ts";
import type { LibraryEntry } from "./library.ts";
import type { QueueStatus } from "./queue.ts";

function entry(overrides: Partial<LibraryEntry> = {}): LibraryEntry {
  return { serviceId: 1, monitored: true, hasFiles: false, complete: false, ...overrides };
}

const downloading: QueueStatus = { state: "downloading", progress: 0.5 };

describe("resolveState", () => {
  test("the queue speaks first, whatever is already on disk", () => {
    expect(resolveState(entry({ hasFiles: true }), downloading)).toEqual(downloading);
    expect(resolveState(entry({ monitored: false }), downloading)).toEqual(downloading);
  });

  // An upgrade for a film already there is nothing the requester is waiting on.
  test("a title complete on disk stays ready while an upgrade downloads", () => {
    expect(resolveState(entry({ hasFiles: true, complete: true }), downloading)).toEqual({
      state: "ready",
    });
  });

  test("files on disk and nothing in the queue is ready", () => {
    expect(resolveState(entry({ hasFiles: true }), undefined)).toEqual({
      state: "ready",
      missing: undefined,
    });
  });

  // A series is watchable and short of a season at the same time.
  test("a ready series still says which season it is short of", () => {
    const missing = [{ season: 4, episodes: 2 }];

    expect(resolveState(entry({ hasFiles: true, missing }), undefined)).toEqual({
      state: "ready",
      missing,
    });
    expect(resolveState(entry({ hasFiles: true, missing }), downloading)).toMatchObject({
      state: "downloading",
      missing,
    });
  });

  // The one nobody could see before: nothing will ever happen here.
  test("nothing on disk and nobody monitoring is paused", () => {
    expect(resolveState(entry({ monitored: false }), undefined)).toEqual({ state: "paused" });
  });

  test("a title that is not out yet says when it is expected", () => {
    const awaiting = { reason: "unreleased" as const, expectedAt: "2026-03-06" };

    expect(resolveState(entry({ awaiting }), undefined)).toEqual({
      state: "unreleased",
      expectedAt: "2026-03-06",
    });
  });

  test("a film out only in cinemas waits for its digital release", () => {
    const awaiting = { reason: "waiting" as const, expectedAt: "2025-12-01" };

    expect(resolveState(entry({ awaiting }), undefined)).toEqual({
      state: "waiting",
      expectedAt: "2025-12-01",
    });
  });

  test("obtainable, monitored, and nothing to show for it is searching", () => {
    expect(resolveState(entry(), undefined)).toEqual({ state: "searching", since: undefined });
  });

  // Months since anything was tried is the difference between looking and giving up.
  test("a search says when it was last run", () => {
    const lastSearchedAt = "2026-06-18T13:41:26Z";

    expect(resolveState(entry({ lastSearchedAt }), undefined)).toEqual({
      state: "searching",
      since: lastSearchedAt,
    });
  });

  // The request outlives the title, so a removal has to read as something.
  test("a title no longer in the library is removed", () => {
    expect(resolveState(undefined, undefined)).toEqual({ state: "removed" });
  });

  // Absence cannot say who took it out; what we wrote down when it left can.
  test("a removal we recorded says who did it and when", () => {
    const at = new Date("2026-09-01T10:00:00Z");

    expect(
      resolveState(undefined, undefined, { removedBy: "Jason", deletedFiles: true, at }),
    ).toEqual({
      state: "removed",
      detail: "Removed by Jason",
      since: at.toISOString(),
    });
  });

  test("a removal nobody was named for still says when it happened", () => {
    const at = new Date("2026-09-01T10:00:00Z");

    expect(
      resolveState(undefined, undefined, { removedBy: null, deletedFiles: false, at }),
    ).toEqual({ state: "removed", detail: undefined, since: at.toISOString() });
  });
});

describe("scopeOf", () => {
  const season = entry({ hasFiles: true, complete: true });
  const series = entry({ seasons: new Map([[3, season]]) });

  test("a request for the whole series is answered by the series", () => {
    expect(scopeOf(series, null)).toBe(series);
  });

  test("a request for one season is answered by that season", () => {
    expect(scopeOf(series, 3)).toBe(season);
  });

  // Releasing a season leaves the request behind it pointing at nothing, which
  // is the same position as a title removed from the library.
  test("a season the series no longer has is nothing at all", () => {
    expect(scopeOf(series, 4)).toBeUndefined();
    expect(resolveState(scopeOf(series, 4), undefined)).toEqual({ state: "removed" });
  });
});
