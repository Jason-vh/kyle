import { describe, expect, test } from "bun:test";
import { discardable } from "./retry.ts";

function record(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    status: "downloading",
    trackedDownloadStatus: "ok",
    trackedDownloadState: "downloading",
    size: 1000,
    sizeleft: 400,
    ...overrides,
  };
}

describe("discardable", () => {
  test("gives up on a stalled release, so the next search finds another", () => {
    const stalled = record(2, {
      status: "warning",
      errorMessage: "The download is stalled with no connections",
    });

    expect(discardable([record(1), stalled])).toEqual([stalled]);
  });

  // The file is already there; another release is not what it needs.
  test("leaves a blocked import alone", () => {
    const blocked = record(3, {
      status: "completed",
      trackedDownloadStatus: "warning",
      trackedDownloadState: "importPending",
      sizeleft: 0,
    });

    expect(discardable([blocked])).toEqual([]);
  });

  test("leaves a healthy download alone", () => {
    expect(discardable([record(1)])).toEqual([]);
  });
});
