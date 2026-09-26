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

  test("keeps grabbing and importing a season pack as two lines", () => {
    const pack = (kind: "grabbed" | "imported", hours: number): Occurrence[] =>
      [1, 2].map((episodeNumber) => ({
        kind,
        at: at(hours),
        episode: { seasonNumber: 3, episodeNumber },
        quality: "WEBDL-1080p",
      }));

    const events = groupOccurrences([...pack("grabbed", 0), ...pack("imported", 1)]);

    expect(events.map((event) => [event.kind, event.detail])).toEqual([
      ["grabbed", "Season 3 · 2 episodes · WEBDL-1080p"],
      ["imported", "Season 3 · 2 episodes · WEBDL-1080p"],
    ]);
  });

  test("describes a movie by its quality alone", () => {
    const [event] = groupOccurrences([{ kind: "imported", at: at(0), quality: "Bluray-1080p" }]);

    expect(event).toMatchObject({ kind: "imported", detail: "Bluray-1080p" });
    expect(event?.person).toBeUndefined();
  });

  test("leaves a movie play with nothing to add undescribed", () => {
    const [event] = groupOccurrences([{ kind: "watched", at: at(0), person: alice }]);

    expect(event?.detail).toBeUndefined();
  });
});
