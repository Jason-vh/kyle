import { expect, test } from "bun:test";
import {
  DEFAULT_LIMITS,
  planSweep,
  type QueueEntry,
  type SweepState,
  type TorrentOrigin,
} from "./plan.ts";

const NOW = Date.UTC(2026, 8, 20, 4, 0, 0);
const SETTLED = (NOW - 72 * 60 * 60 * 1000) / 1000;
const FRESH = (NOW - 60 * 60 * 1000) / 1000;
const HOURS_AGO = (hours: number) => new Date(NOW - hours * 60 * 60 * 1000).toISOString();

function torrent(overrides: Partial<TorrentOrigin> = {}): TorrentOrigin {
  return {
    hash: "HASH",
    name: "A Film 2020 2160p",
    bytes: 10 * 1024 ** 3,
    completedAt: SETTLED,
    known: true,
    imports: [{ fileId: 1, alive: true }],
    queued: false,
    ...overrides,
  };
}

function entry(overrides: Partial<QueueEntry> = {}): QueueEntry {
  return {
    mediaType: "movie",
    queueId: 7,
    serviceId: 11,
    title: "A Film",
    status: { state: "downloading", since: HOURS_AGO(1) },
    ...overrides,
  };
}

function decide(state: SweepState) {
  return planSweep(state, DEFAULT_LIMITS, NOW);
}

test("a quiet library produces nothing", () => {
  expect(decide({ torrents: [torrent()], queue: [] })).toEqual([]);
});

test("a torrent the services have never heard of is flagged, never deleted", () => {
  const [action] = decide({ torrents: [torrent({ known: false })], queue: [] });

  expect(action?.kind).toBe("flag");
  if (action?.kind === "flag") expect(action.bytes).toBe(10 * 1024 ** 3);
});

test("a torrent whose imported file the library has replaced is freed", () => {
  const [action] = decide({
    torrents: [torrent({ imports: [{ fileId: 1, alive: false }] })],
    queue: [],
  });

  expect(action).toEqual({
    kind: "delete-torrent",
    hash: "HASH",
    subject: "A Film 2020 2160p",
    bytes: 10 * 1024 ** 3,
    reason: "the library no longer holds the file it imported",
  });
});

test("one live file among several keeps a torrent", () => {
  const decided = decide({
    torrents: [
      torrent({
        imports: [
          { fileId: 1, alive: false },
          { fileId: 2, alive: true },
        ],
      }),
    ],
    queue: [],
  });

  expect(decided).toEqual([]);
});

test("a download that never imported anything is freed once old enough", () => {
  const [action] = decide({ torrents: [torrent({ imports: [] })], queue: [] });

  expect(action?.kind).toBe("delete-torrent");
});

test("a torrent still inside its grace period is left to finish importing", () => {
  expect(decide({ torrents: [torrent({ completedAt: FRESH, imports: [] })], queue: [] })).toEqual(
    [],
  );
});

test("a torrent still in a queue is never touched, however dead its imports", () => {
  const decided = decide({
    torrents: [torrent({ queued: true, imports: [{ fileId: 1, alive: false }] })],
    queue: [],
  });

  expect(decided).toEqual([]);
});

test("a stalled download is given another chance, not deleted", () => {
  const [action] = decide({
    torrents: [],
    queue: [
      entry({ status: { state: "stalled", detail: "Download stalled", since: HOURS_AGO(13) } }),
    ],
  });

  expect(action).toEqual({
    kind: "retry-download",
    mediaType: "movie",
    queueId: 7,
    serviceId: 11,
    subject: "A Film",
    reason: "Download stalled",
  });
});

test("a download stalled only just now is left alone", () => {
  const decided = decide({
    torrents: [],
    queue: [
      entry({ status: { state: "stalled", detail: "Download stalled", since: HOURS_AGO(1) } }),
    ],
  });

  expect(decided).toEqual([]);
});

test("an import blocked by a known-hopeless release is dropped and blocklisted", () => {
  const [action] = decide({
    torrents: [],
    queue: [
      entry({
        status: {
          state: "blocked",
          detail: "No files found are eligible for import in C:\\bait.exe",
          since: HOURS_AGO(49),
        },
      }),
    ],
  });

  expect(action?.kind).toBe("discard-download");
});

test("an import blocked for a reason Kyle does not know asks for a person", () => {
  const [action] = decide({
    torrents: [],
    queue: [
      entry({
        mediaType: "series",
        status: {
          state: "blocked",
          detail: "Invalid video codec",
          since: HOURS_AGO(49),
        },
      }),
    ],
  });

  expect(action?.kind).toBe("flag");
});

test("a blocked import inside its grace period is left alone", () => {
  const decided = decide({
    torrents: [],
    queue: [
      entry({ status: { state: "blocked", detail: "Sample rejected", since: HOURS_AGO(2) } }),
    ],
  });

  expect(decided).toEqual([]);
});

test("a sweep that wants more deletions than it may do deletes nothing", () => {
  const torrents = [1, 2, 3].map((n) => torrent({ hash: `H${n}`, name: `Film ${n}`, imports: [] }));
  const [action] = planSweep({ torrents, queue: [] }, { ...DEFAULT_LIMITS, maxDeletes: 2 }, NOW);

  expect(action?.kind).toBe("flag");
  if (action?.kind === "flag") expect(action.reason).toContain("held back");
});

test("a sweep that wants more bytes than it may free deletes nothing", () => {
  const torrents = [torrent({ imports: [] }), torrent({ hash: "H2", name: "Film 2", imports: [] })];
  const decided = planSweep({ torrents, queue: [] }, { ...DEFAULT_LIMITS, maxBytes: 1024 }, NOW);

  expect(decided.every((action) => action.kind === "flag")).toBe(true);
});
