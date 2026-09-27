import { describe, expect, test } from "vitest";
import type { AppNotification } from "#shared/types";
import { groupByDay, timeOfDay } from "./notifications";

const now = new Date(2026, 8, 27, 15, 0);

function notification(id: string, at: Date): AppNotification {
  return {
    id,
    mediaType: "movie",
    title: id,
    body: "",
    read: false,
    createdAt: at.toISOString(),
  };
}

describe("groupByDay", () => {
  test("gathers notifications under the day they arrived, newest first", () => {
    const days = groupByDay(
      [
        notification("a", new Date(2026, 8, 27, 9)),
        notification("b", new Date(2026, 8, 27, 1)),
        notification("c", new Date(2026, 8, 26, 22)),
        notification("d", new Date(2026, 8, 20, 12)),
      ],
      now,
    );

    expect(days.map((day) => [day.label, day.items.map((item) => item.id)])).toEqual([
      ["Today", ["a", "b"]],
      ["Yesterday", ["c"]],
      ["20 Sept", ["d"]],
    ]);
  });
});

describe("timeOfDay", () => {
  test("gives only the time, since the day is already its heading", () => {
    expect(timeOfDay(new Date(2026, 8, 26, 22, 5).toISOString())).toBe("22:05");
  });
});
