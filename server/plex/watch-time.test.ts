import { afterEach, describe, expect, test } from "bun:test";
import { getWatchTime } from "./watch-time.ts";

process.env.PLEX_SERVER_URL = "http://plex.test";
process.env.PLEX_SERVER_TOKEN = "t";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const MINUTE = 60_000;

interface Stub {
  history: { ratingKey: string | null }[];
  durations: Record<string, number>;
}

/** Plex, answering a history call and then a batched metadata call. */
function stubPlex(stub: Stub): string[] {
  const urls: string[] = [];

  globalThis.fetch = ((url: string) => {
    urls.push(url);

    if (url.includes("/status/sessions/history/all")) {
      return Promise.resolve(Response.json({ MediaContainer: { Metadata: stub.history } }));
    }

    const ids = url.slice(url.lastIndexOf("/") + 1).split(",");
    const Metadata = ids
      .filter((id) => stub.durations[id] !== undefined)
      .map((id) => ({ ratingKey: id, duration: stub.durations[id] }));
    return Promise.resolve(Response.json({ MediaContainer: { Metadata } }));
  }) as unknown as typeof fetch;

  return urls;
}

const since = new Date("2026-09-01T00:00:00Z");
const EPOCH = Math.floor(since.getTime() / 1000);

describe("getWatchTime", () => {
  // Percent-encoding this makes Plex ignore the filter and return the whole
  // history, which reads as a plausible number rather than an error.
  test("sends the window filter unencoded, or Plex silently drops it", async () => {
    const urls = stubPlex({ history: [], durations: {} });

    await getWatchTime(since);

    expect(urls[0]).toContain(`viewedAt>=${EPOCH}`);
    expect(urls[0]).not.toContain("%3E%3D");
  });

  test("sums the runtime of everything played", async () => {
    stubPlex({
      history: [{ ratingKey: "1" }, { ratingKey: "2" }],
      durations: { 1: 30 * MINUTE, 2: 45 * MINUTE },
    });

    expect(await getWatchTime(since)).toEqual({ minutes: 75, plays: 2 });
  });

  // A history row is one viewing, so the same episode twice is twice the time.
  test("counts a repeat viewing again", async () => {
    stubPlex({
      history: [{ ratingKey: "1" }, { ratingKey: "1" }],
      durations: { 1: 20 * MINUTE },
    });

    expect(await getWatchTime(since)).toEqual({ minutes: 40, plays: 2 });
  });

  test("asks about each item once, however often it was played", async () => {
    const urls = stubPlex({
      history: [{ ratingKey: "1" }, { ratingKey: "1" }, { ratingKey: "2" }],
      durations: { 1: MINUTE, 2: MINUTE },
    });

    await getWatchTime(since);

    expect(urls[1]).toContain("/library/metadata/1,2");
  });

  // Deleting an episode leaves its history behind with nothing to measure.
  test("contributes nothing for an item that is gone, but still counts the play", async () => {
    stubPlex({
      history: [{ ratingKey: "1" }, { ratingKey: "gone" }],
      durations: { 1: 10 * MINUTE },
    });

    expect(await getWatchTime(since)).toEqual({ minutes: 10, plays: 2 });
  });

  test("survives a history row that lost its id entirely", async () => {
    stubPlex({ history: [{ ratingKey: null }], durations: {} });

    expect(await getWatchTime(since)).toEqual({ minutes: 0, plays: 1 });
  });

  // A busy week would otherwise build a URL long enough to be rejected.
  test("splits a long list of items across several calls", async () => {
    const history = Array.from({ length: 200 }, (_, i) => ({ ratingKey: String(i) }));
    const durations = Object.fromEntries(history.map((row) => [row.ratingKey, MINUTE]));
    const urls = stubPlex({ history, durations });

    const result = await getWatchTime(since);

    expect(result).toEqual({ minutes: 200, plays: 200 });
    // One history call, then 80 + 80 + 40.
    expect(urls).toHaveLength(4);
  });
});
