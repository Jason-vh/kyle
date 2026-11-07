import { expect, test } from "bun:test";
import { datedRelease, relativeDay } from "./days.ts";

test("a day either side of today reads as a word", () => {
  expect(relativeDay("2026-11-07", "2026-11-07")).toBe("today");
  expect(relativeDay("2026-11-08", "2026-11-07")).toBe("tomorrow");
  expect(relativeDay("2026-11-06", "2026-11-07")).toBe("yesterday");
});

test("a release takes its day from a full timestamp", () => {
  expect(datedRelease("2026-11-10T00:00:00Z", "2026-11-07")).toEqual({
    date: "2026-11-10",
    when: "in 3 days",
  });
  expect(datedRelease(undefined, "2026-11-07")).toBeNull();
});
