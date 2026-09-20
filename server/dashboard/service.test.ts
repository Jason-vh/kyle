import { describe, expect, test } from "bun:test";
import { stillComing } from "./service.ts";
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
