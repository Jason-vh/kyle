import { describe, expect, test } from "bun:test";
import {
  classify,
  episodeKey,
  episodeQueues,
  summarise,
  summariseSeason,
  type QueueRecord,
} from "./queue.ts";

/** A healthy download, which each case bends into the shape it is about. */
function record(overrides: Partial<QueueRecord> = {}): QueueRecord {
  return {
    status: "downloading",
    trackedDownloadStatus: "ok",
    trackedDownloadState: "downloading",
    size: 1000,
    sizeleft: 400,
    timeleft: "00:12:31",
    added: "2025-03-01T10:00:00Z",
    ...overrides,
  };
}

describe("classify", () => {
  test("a healthy download says how far along it is", () => {
    expect(classify(record())).toEqual({
      state: "downloading",
      since: "2025-03-01T10:00:00Z",
      progress: 0.6,
      eta: "00:12:31",
    });
  });

  // The case that matters: finished, in the client, and going nowhere alone.
  test("a finished download waiting on an import is blocked, with the reason", () => {
    expect(
      classify(
        record({
          status: "completed",
          trackedDownloadStatus: "warning",
          trackedDownloadState: "importPending",
          sizeleft: 0,
          statusMessages: [{ title: "Rick.and.Morty.S01", messages: ["Found archive file"] }],
        }),
      ),
    ).toMatchObject({ state: "blocked", detail: "Found archive file" });
  });

  test("an import the service has refused outright is blocked", () => {
    expect(classify(record({ trackedDownloadState: "importBlocked" })).state).toBe("blocked");
    expect(classify(record({ status: "failed", trackedDownloadState: "failed" })).state).toBe(
      "blocked",
    );
  });

  test("a download client nobody can reach is blocked, not stalled", () => {
    expect(classify(record({ status: "downloadClientUnavailable" })).state).toBe("blocked");
  });

  test("a warning on an unfinished download is a stall, and keeps its progress", () => {
    expect(
      classify(
        record({
          status: "warning",
          trackedDownloadStatus: "warning",
          errorMessage: "The download is stalled with no connections",
        }),
      ),
    ).toMatchObject({
      state: "stalled",
      detail: "The download is stalled with no connections",
      progress: 0.6,
    });
  });

  test("an import under way is nearly there", () => {
    expect(classify(record({ trackedDownloadState: "importing", sizeleft: 0 })).state).toBe(
      "importing",
    );
  });

  test("a release held back by a delay profile has been found", () => {
    expect(classify(record({ status: "delay" })).state).toBe("found");
  });

  // Sonarr nests its messages; a title with no message list is all there is.
  test("falls back to the title of a status message when it carries no text", () => {
    const status = classify(record({ status: "warning", statusMessages: [{ title: "Sample" }] }));
    expect(status.detail).toBe("Sample");
  });

  test("a download of unknown size is still a download", () => {
    expect(classify(record({ size: 0, sizeleft: 0 }))).toEqual({
      state: "downloading",
      since: "2025-03-01T10:00:00Z",
    });
  });
});

describe("summarise", () => {
  test("nothing in the queue is no state at all", () => {
    expect(summarise([])).toBeUndefined();
  });

  // A series downloading one episode while 24 sit un-importable is not "downloading".
  test("what needs a hand beats what is merely busy", () => {
    const status = summarise([
      record(),
      record({ trackedDownloadState: "importPending", errorMessage: "Not a preferred word" }),
    ]);

    expect(status).toMatchObject({ state: "blocked", detail: "Not a preferred word" });
  });

  test("a stall beats a healthy download, and a download beats an import", () => {
    expect(summarise([record(), record({ status: "warning" })])?.state).toBe("stalled");
    expect(summarise([record(), record({ trackedDownloadState: "imported" })])?.state).toBe(
      "downloading",
    );
  });

  test("among downloads the furthest along is the one shown", () => {
    const status = summarise([record({ sizeleft: 900 }), record({ sizeleft: 100 })]);
    expect(status?.progress).toBeCloseTo(0.9);
  });
});

describe("summarise, naming the download", () => {
  const NO_CONNECTIONS = "The download is stalled with no connections";

  /** A stalled torrent carrying the given episodes of one release. */
  function stalled(downloadId: string, title: string, episodes: [number, number][]) {
    return episodes.map(([seasonNumber, episodeNumber]) =>
      record({
        status: "warning",
        errorMessage: NO_CONNECTIONS,
        downloadId,
        title,
        episode: { seasonNumber, episodeNumber },
      }),
    );
  }

  const seasonPack = stalled(
    "pack",
    "Survivor.South.Africa.S07.1080p.WEB-DL",
    Array.from({ length: 18 }, (_, i) => [7, i + 1] as [number, number]),
  );

  test("an episode's torrent is named for its episode", () => {
    const status = summarise(stalled("a", "Adventure Time S06E07 1080p", [[6, 7]]));
    expect(status?.detail).toBe(`S06E07 \u00b7 ${NO_CONNECTIONS}`);
  });

  test("a release of a few episodes is named for their run", () => {
    const status = summarise(
      stalled("a", "Adventure Time S05E13-E14 1080p", [
        [5, 13],
        [5, 14],
      ]),
    );
    expect(status?.detail).toBe(`S05E13\u2013E14 \u00b7 ${NO_CONNECTIONS}`);
  });

  // Eighteen episode records, but one torrent: it counts once, as its season.
  test("a season pack is named for its season, and counts once", () => {
    expect(summarise(seasonPack)?.detail).toBe(`Season 7 \u00b7 ${NO_CONNECTIONS}`);
  });

  test("a pack of several seasons is named for the span", () => {
    const status = summarise(
      stalled("a", "Adventure Time S01-S05 1080p", [
        [1, 1],
        [3, 2],
        [5, 9],
      ]),
    );
    expect(status?.detail).toBe(`Seasons 1\u20135 \u00b7 ${NO_CONNECTIONS}`);
  });

  test("the other downloads in the same state are counted", () => {
    const status = summarise([
      ...stalled("a", "Adventure Time S06E07", [[6, 7]]),
      ...stalled("b", "Adventure Time S06E10", [[6, 10]]),
      ...stalled("c", "Adventure Time S05E13-E14", [
        [5, 13],
        [5, 14],
      ]),
      record({ downloadId: "d", episode: { seasonNumber: 7, episodeNumber: 1 } }),
    ]);
    expect(status?.detail).toBe(`S06E07 and 2 more \u00b7 ${NO_CONNECTIONS}`);
  });

  // In the season's own row, "Season 7" would only repeat the row's name.
  test("a pack of the season being summarised goes unnamed", () => {
    expect(summarise(seasonPack, 7)?.detail).toBe(NO_CONNECTIONS);
  });

  test("a movie's download is not named, having no episodes", () => {
    const status = summarise([record({ status: "warning", errorMessage: NO_CONNECTIONS })]);
    expect(status?.detail).toBe(NO_CONNECTIONS);
  });
});

describe("a season's row and its episodes' rows", () => {
  const NO_CONNECTIONS = "The download is stalled with no connections";

  function download(downloadId: string, title: string, episodes: number[], overrides = {}) {
    return episodes.map((episodeNumber) =>
      record({
        downloadId,
        title,
        episode: { seasonNumber: 6, episodeNumber },
        ...overrides,
      }),
    );
  }
  const stall = { status: "warning", errorMessage: NO_CONNECTIONS };

  test("a season pack's message is the season's", () => {
    const status = summariseSeason(download("pack", "Show.S06.1080p", [1, 2, 3], stall));
    expect(status).toMatchObject({ state: "stalled", detail: NO_CONNECTIONS });
  });

  // The season still reads as stalled, but which episode and why is on its row.
  test("an episode's message is not the season's", () => {
    const status = summariseSeason([
      ...download("a", "Show S06E07 1080p", [7], stall),
      ...download("b", "Show S06E08 1080p", [8]),
    ]);
    expect(status?.state).toBe("stalled");
    expect(status?.detail).toBeUndefined();
  });

  test("an episode's own download carries its message", () => {
    const episodes = episodeQueues(download("a", "Show S06E07 1080p", [7], stall));
    expect(episodes.get(episodeKey(6, 7))).toMatchObject({
      state: "stalled",
      detail: NO_CONNECTIONS,
    });
  });

  test("an episode in a season pack shares its state, not its message", () => {
    const episodes = episodeQueues(download("pack", "Show.S06.1080p", [1, 2], stall));
    expect(episodes.get(episodeKey(6, 2))?.state).toBe("stalled");
    expect(episodes.get(episodeKey(6, 2))?.detail).toBeUndefined();
  });

  test("an episode fetched twice shows the download needing a hand", () => {
    const episodes = episodeQueues([
      ...download("a", "Show S06E07 720p", [7]),
      ...download("b", "Show S06E07 1080p", [7], stall),
    ]);
    expect(episodes.get(episodeKey(6, 7))?.state).toBe("stalled");
  });
});
