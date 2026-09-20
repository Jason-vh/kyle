import { describe, expect, test } from "bun:test";
import { resolveState } from "./state.ts";
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
    expect(resolveState(entry({ hasFiles: true }), undefined)).toEqual({ state: "ready" });
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
    expect(resolveState(entry(), undefined)).toEqual({ state: "searching" });
  });

  // The request outlives the title, so a removal has to read as something.
  test("a title no longer in the library is removed", () => {
    expect(resolveState(undefined, undefined)).toEqual({ state: "removed" });
  });
});
