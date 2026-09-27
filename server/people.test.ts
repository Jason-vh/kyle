import { describe, expect, test } from "bun:test";
import { plexPersonFor, removedByViewer, watchersFor, type Viewer } from "./people.ts";

const viewer: Viewer = { userId: "u1", name: "Jason", plexAccountId: "101" };

describe("watchersFor", () => {
  test("marks the viewer's own Plex account and drops every account id", () => {
    const watchers = [
      { accountId: "101", name: "Jason", watchedAt: "2026-03-01T20:00:00.000Z" },
      { accountId: "2", name: "Sue" },
    ];

    expect(watchersFor(watchers, viewer)).toEqual([
      { name: "Jason", watchedAt: "2026-03-01T20:00:00.000Z", you: true },
      { name: "Sue" },
    ]);
  });

  test("marks nobody for a viewer with no Plex account", () => {
    const watchers = [{ accountId: "101", name: "Jason" }];

    expect(watchersFor(watchers, { userId: "u1", name: "Jason" })).toEqual([{ name: "Jason" }]);
  });
});

describe("Kyle names over Plex names", () => {
  const named: Viewer = { ...viewer, plexNames: new Map([["2", "Jordan"]]) };

  test("calls a watcher by the name of the Kyle user their Plex account belongs to", () => {
    const watchers = [{ accountId: "2", name: "daubinet", thumb: "https://plex.tv/d.png" }];
    expect(watchersFor(watchers, named)).toEqual([
      { name: "Jordan", thumb: "https://plex.tv/d.png" },
    ]);
  });

  test("keeps the Plex name for anyone Kyle does not know", () => {
    expect(plexPersonFor({ accountId: "9", name: "stranger" }, named)).toEqual({
      name: "stranger",
    });
  });
});

describe("plexPersonFor", () => {
  test("marks a play by the viewer", () => {
    expect(plexPersonFor({ accountId: "101", name: "Jason" }, viewer)).toEqual({
      name: "Jason",
      you: true,
    });
  });
});

describe("removedByViewer", () => {
  const at = new Date();

  test("goes by user id where one was recorded", () => {
    const removal = { removedBy: "Jason", removedByUserId: "u2", deletedFiles: true, at };
    expect(removedByViewer(removal, viewer)).toBe(false);
  });

  test("falls back to the name for older removals", () => {
    const removal = { removedBy: "Jason", removedByUserId: null, deletedFiles: true, at };
    expect(removedByViewer(removal, viewer)).toBe(true);
  });
});
