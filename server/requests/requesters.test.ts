import { describe, expect, test } from "bun:test";
import { annotateRequesters, type Attributable, type Requester } from "./requesters.ts";

const series = (): Attributable => ({
  mediaType: "series",
  tmdbId: 95396,
  requestedBy: [],
  requestedByMe: false,
});

const request = (overrides: Partial<Requester>): Requester => ({
  mediaType: "series",
  tmdbId: 95396,
  userId: "sue",
  name: "Sue",
  ...overrides,
});

describe("annotateRequesters", () => {
  test("names someone once, however many seasons they asked for", () => {
    const item = series();
    annotateRequesters([item], "viewer", [request({}), request({})]);

    expect(item.requestedBy).toEqual([{ name: "Sue", thumb: undefined }]);
  });

  test("shows each requester's Plex avatar when there is one", () => {
    const item = series();
    const avatars = new Map([["plex-sue", "https://plex.tv/sue.png"]]);
    annotateRequesters(
      [item],
      "viewer",
      [request({ plexAccountId: "plex-sue" }), request({ userId: "bob", name: "Bob" })],
      avatars,
    );

    expect(item.requestedBy).toEqual([
      { name: "Sue", thumb: "https://plex.tv/sue.png" },
      { name: "Bob", thumb: undefined },
    ]);
  });

  test("marks what the viewer asked for", () => {
    const item = series();
    annotateRequesters([item], "sue", [request({})]);

    expect(item.requestedByMe).toBe(true);
  });

  test("leaves media nobody requested alone", () => {
    const item = { ...series(), tmdbId: 1 };
    annotateRequesters([item], "sue", [request({})]);

    expect(item.requestedBy).toEqual([]);
    expect(item.requestedByMe).toBe(false);
  });
});
