import { describe, expect, test } from "bun:test";
import { groupOccurrences, type Occurrence } from "./activity.ts";

const HOUR = 60 * 60 * 1000;
const START = Date.parse("2026-03-01T20:00:00Z");
const at = (hours: number) => new Date(START + hours * HOUR).toISOString();

const alice = { name: "Alice" };
const bob = { name: "Bob" };

function watched(hours: number, episodeNumber: number, person = alice): Occurrence {
  return {
    kind: "watched",
    at: at(hours),
    person,
    episode: { seasonNumber: 1, episodeNumber },
  };
}

describe("groupOccurrences", () => {
  test("folds an evening's episodes into one line, dated by the last", () => {
    const [event, ...rest] = groupOccurrences([watched(0, 1), watched(1, 2), watched(2, 3)]);

    expect(rest).toHaveLength(0);
    expect(event).toMatchObject({
      kind: "watched",
      at: at(2),
      person: alice,
      detail: "Season 1 · 3 episodes",
    });
  });

  test("starts a new line after a night's sleep", () => {
    const events = groupOccurrences([watched(0, 1), watched(20, 2)]);

    expect(events.map((event) => event.at)).toEqual([at(0), at(20)]);
  });

  test("keeps two people watching together apart", () => {
    const events = groupOccurrences([watched(0, 1, alice), watched(0, 1, bob)]);

    expect(events.map((event) => event.person?.name)).toEqual(["Alice", "Bob"]);
  });

  test("counts an episode once however often it was played", () => {
    const [event] = groupOccurrences([
      { ...watched(0, 1), episode: { seasonNumber: 1, episodeNumber: 1, title: "Pilot" } },
      watched(1, 1),
    ]);

    expect(event?.detail).toBe("S01E01 Pilot");
  });

  test("reads a season pack as one download", () => {
    const events = groupOccurrences(
      [1, 2].map((episodeNumber) => ({
        kind: "imported",
        at: at(episodeNumber),
        episode: { seasonNumber: 3, episodeNumber },
      })),
    );

    expect(events.map((event) => [event.kind, event.detail])).toEqual([
      ["imported", "Season 3 · 2 episodes"],
    ]);
  });

  // Three releases grabbed in a minute started one download, not three.
  test("folds grabs in one sitting into one start, apart from the landing", () => {
    const events = groupOccurrences([
      { kind: "grabbed", at: at(0) },
      { kind: "grabbed", at: at(0.01) },
      { kind: "grabbed", at: at(0.02) },
      { kind: "imported", at: at(0.2) },
    ]);

    expect(events.map((event) => [event.kind, event.at])).toEqual([
      ["grabbed", at(0.02)],
      ["imported", at(0.2)],
    ]);
  });

  test("leaves a movie download undescribed", () => {
    const [event] = groupOccurrences([{ kind: "imported", at: at(0) }]);

    expect(event).toMatchObject({ kind: "imported" });
    expect(event?.detail).toBeUndefined();
    expect(event?.person).toBeUndefined();
  });

  test("leaves a movie play with nothing to add undescribed", () => {
    const [event] = groupOccurrences([{ kind: "watched", at: at(0), person: alice }]);

    expect(event?.detail).toBeUndefined();
  });
});
