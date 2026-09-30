import { describe, expect, test } from "vitest";
import {
  formatDate,
  formatDuration,
  formatEta,
  formatHours,
  formatNames,
  formatSize,
} from "./format";

describe("formatNames", () => {
  test("reads as a sentence at every length", () => {
    expect(formatNames([])).toBe("");
    expect(formatNames(["Bob"])).toBe("Bob");
    expect(formatNames(["Bob", "Jane"])).toBe("Bob and Jane");
    expect(formatNames(["Bob", "Jane", "Sue"])).toBe("Bob, Jane and Sue");
  });
});

describe("formatDate", () => {
  const now = new Date("2026-09-20");

  test("leaves out the year while it is the one we are in", () => {
    expect(formatDate("2026-03-06", now)).toBe("6 Mar");
  });

  test("says the year once it stops being obvious", () => {
    expect(formatDate("2027-01-08T01:00:00Z", now)).toBe("8 Jan 2027");
  });

  test("says nothing for a date it cannot read", () => {
    expect(formatDate("soon", now)).toBe("");
  });
});

describe("formatSize", () => {
  test("steps through decimal units, as the services report them", () => {
    expect(formatSize(512)).toBe("512 B");
    expect(formatSize(1_500)).toBe("1.5 KB");
    expect(formatSize(2_400_000_000)).toBe("2.4 GB");
    expect(formatSize(1_623_571_140_608)).toBe("1.6 TB");
  });

  // A precise byte count says nothing once it is this large.
  test("drops the decimal once the figure is big enough not to need it", () => {
    expect(formatSize(15_990_825_447_424)).toBe("16 TB");
  });

  test("says nothing rather than zero for an unknown size", () => {
    expect(formatSize(0)).toBe("—");
    expect(formatSize(-1)).toBe("—");
  });

  // Beyond terabytes there is no unit left, so it must not fall off the end.
  test("caps at the largest unit it knows", () => {
    expect(formatSize(5_000_000_000_000_000)).toBe("5000 TB");
  });
});

describe("formatHours", () => {
  test("reads as whole hours", () => {
    expect(formatHours(2520)).toBe("42h");
    expect(formatHours(2549)).toBe("42h");
    expect(formatHours(2550)).toBe("43h");
    expect(formatHours(60)).toBe("1h");
  });

  test("falls back to minutes under an hour", () => {
    expect(formatHours(45)).toBe("45m");
    expect(formatHours(0)).toBe("0m");
    expect(formatHours(59.4)).toBe("59m");
  });
});

describe("formatDuration", () => {
  test("reads as hours and minutes", () => {
    expect(formatDuration(1740)).toBe("29h 0m");
    expect(formatDuration(45)).toBe("45m");
    expect(formatDuration(0)).toBe("0m");
    expect(formatDuration(200)).toBe("3h 20m");
  });

  test("rounds to whole minutes", () => {
    expect(formatDuration(59.6)).toBe("1h 0m");
  });
});

describe("formatEta", () => {
  test("reads a download client's clock as a person would say it", () => {
    expect(formatEta("00:12:31")).toBe("12 min");
    expect(formatEta("02:05:00")).toBe("2h 5m");
    expect(formatEta("1.02:00:00")).toBe("1d 2h");
  });

  test("never promises it is already done", () => {
    expect(formatEta("00:00:20")).toBe("1 min");
  });

  test("says nothing for a clock it cannot read", () => {
    expect(formatEta("soon")).toBe("");
  });
});
