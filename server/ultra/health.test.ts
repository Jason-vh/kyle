import { describe, expect, test } from "bun:test";
import { announcement, conditionFor, formatBytes, shouldAnnounce } from "./health.ts";

const HOUR = 60 * 60 * 1000;
const TB = 1000 ** 4;

const stat = (freeBytes: number, totalBytes = 8 * TB) => ({ freeBytes, totalBytes });

describe("conditionFor", () => {
  test("a disk with room is fine", () => {
    expect(conditionFor(stat(2 * TB))).toBe("ok");
  });

  test("under a twentieth left is low", () => {
    expect(conditionFor(stat(0.18 * TB))).toBe("low");
  });

  test("full is low, not fine", () => {
    expect(conditionFor(stat(0))).toBe("low");
  });

  // A quota of nothing is a quota not yet known, not a full disk.
  test("says nothing is wrong when there is no total to divide by", () => {
    expect(conditionFor(stat(0, 0))).toBe("ok");
  });
});

describe("shouldAnnounce", () => {
  test("says nothing the first time all is well", () => {
    expect(shouldAnnounce("ok", null, 0)).toBe(false);
  });

  test("speaks up the first time it is not", () => {
    expect(shouldAnnounce("low", null, 0)).toBe(true);
  });

  test("speaks when the condition changes", () => {
    expect(shouldAnnounce("unreachable", { condition: "low", at: 0 }, HOUR)).toBe(true);
  });

  // Recovery is worth hearing about, having heard about the failure.
  test("says when things are well again", () => {
    expect(shouldAnnounce("ok", { condition: "unreachable", at: 0 }, HOUR)).toBe(true);
  });

  test("does not repeat itself while nothing changes", () => {
    expect(shouldAnnounce("low", { condition: "low", at: 0 }, 6 * HOUR)).toBe(false);
  });

  test("says it again after half a day of the same", () => {
    expect(shouldAnnounce("low", { condition: "low", at: 0 }, 12 * HOUR)).toBe(true);
  });

  test("never repeats good news", () => {
    expect(shouldAnnounce("ok", { condition: "ok", at: 0 }, 30 * 24 * HOUR)).toBe(false);
  });
});

describe("announcement", () => {
  test("names what went wrong when the box will not answer", () => {
    const text = announcement("unreachable", undefined, "ultra API error 502");

    expect(text).toContain("not answering");
    expect(text).toContain("ultra API error 502");
  });

  test("gives the figures when the disk is nearly full", () => {
    const text = announcement("low", stat(0.18 * TB));

    expect(text).toContain("180 GB");
    expect(text).toContain("8.0 TB");
    expect(text).toContain("2.3%");
  });

  test("says how much is free again on recovery", () => {
    expect(announcement("ok", stat(2 * TB))).toContain("fine again");
  });
});

describe("formatBytes", () => {
  test.each([
    [0, "0 B"],
    [193_273_528_320, "193 GB"],
    [8 * TB, "8.0 TB"],
    [1500, "1.5 KB"],
  ])("%i reads as %s", (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });
});
