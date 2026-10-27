import { describe, expect, test } from "bun:test";
import { shouldAnnounce } from "./announce.ts";

const HOUR = 60 * 60 * 1000;

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
