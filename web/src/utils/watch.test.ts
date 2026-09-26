import { describe, expect, test } from "vitest";
import { lastWatch } from "./watch";

describe("lastWatch", () => {
  test("is whoever played it most recently, whatever the order", () => {
    const latest = lastWatch([
      { name: "Sue", watchedAt: "2024-01-01T00:00:00Z" },
      { name: "Bob", watchedAt: "2025-01-01T00:00:00Z" },
    ]);
    expect(latest?.name).toBe("Bob");
  });

  // Plex does not always date a play; an undated one cannot be the latest.
  test("passes over a play with no date", () => {
    const latest = lastWatch([{ name: "Sue" }, { name: "Bob", watchedAt: "2024-01-01T00:00:00Z" }]);
    expect(latest?.name).toBe("Bob");
  });

  test("is nobody when nobody has a dated play", () => {
    expect(lastWatch([{ name: "Sue" }])).toBeUndefined();
    expect(lastWatch([])).toBeUndefined();
  });
});
