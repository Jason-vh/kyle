import { describe, expect, test } from "bun:test";
import { announcement, conditionFor, formatBytes } from "./health.ts";

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
