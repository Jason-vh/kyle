import { describe, expect, test } from "bun:test";
import { classify, summarise, type QueueRecord } from "./queue.ts";

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
