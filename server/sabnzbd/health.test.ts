import { describe, expect, test } from "bun:test";
import { announcement, conditionFor } from "./health.ts";
import type { SabQueue } from "./api.ts";

const queue = (overrides: Partial<SabQueue> = {}): SabQueue => ({
  paused: false,
  pause_int: "0",
  noofslots: 81,
  sizeleft: "96.2 GB",
  ...overrides,
});

describe("conditionFor", () => {
  test("a running queue is fine", () => {
    expect(conditionFor(queue())).toBe("ok");
  });

  test("a pause with no end is paused", () => {
    expect(conditionFor(queue({ paused: true }))).toBe("paused");
  });

  test("a timed pause resumes by itself, so it is fine", () => {
    expect(conditionFor(queue({ paused: true, pause_int: "30" }))).toBe("ok");
  });
});

describe("announcement", () => {
  test("says how much is waiting behind a pause", () => {
    expect(announcement("paused", queue({ paused: true }))).toContain("81 downloads (96.2 GB)");
  });

  test("names what went wrong when SABnzbd will not answer", () => {
    expect(announcement("unreachable", undefined, "sabnzbd API error 502")).toContain(
      "sabnzbd API error 502",
    );
  });
});
