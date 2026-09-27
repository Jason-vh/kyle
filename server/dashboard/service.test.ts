import { describe, expect, test } from "bun:test";
import { stillComing, windowStart } from "./service.ts";
import type { MediaRequest, RequestState } from "#shared/types.ts";

function request(state: RequestState): MediaRequest {
  return {
    id: `r-${state}`,
    mediaType: "movie",
    tmdbId: 1,
    title: "Arrival",
    year: 2016,
    posterPath: null,
    seasonNumber: null,
    createdAt: new Date().toISOString(),
    state,
  };
}

describe("stillComing", () => {
  // A title someone took out of the library is over, not on its way.
  test("drops what has been removed", () => {
    const kept = stillComing([request("removed"), request("downloading")]);

    expect(kept.map((r) => r.state)).toEqual(["downloading"]);
  });

  test.each([
    "unreleased",
    "waiting",
    "searching",
    "found",
    "downloading",
    "stalled",
    "blocked",
    "importing",
    "ready",
    "paused",
  ] as const)("keeps %s", (state) => {
    expect(stillComing([request(state)])).toHaveLength(1);
  });

  test("keeps an empty list empty", () => {
    expect(stillComing([])).toEqual([]);
  });
});

describe("windowStart", () => {
  const week = 7 * 24 * 60 * 60 * 1000;
  const step = 5 * 60 * 1000;
  const aligned = Date.UTC(2026, 8, 27, 12, 0, 0);

  test("reaches back a week, to the start of a five-minute step", () => {
    expect(windowStart(aligned + week).getTime()).toBe(aligned);
    expect(windowStart(aligned + week + step - 1).getTime()).toBe(aligned);
  });

  test("moves on once the next step begins", () => {
    expect(windowStart(aligned + week + step).getTime()).toBe(aligned + step);
  });
});
