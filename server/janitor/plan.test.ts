import { expect, test } from "bun:test";
import {
  DEFAULT_LIMITS,
  planSweep,
  type HeldMedia,
  type QueueEntry,
  type SweepLimits,
  type SweepState,
  type TorrentOrigin,
} from "./plan.ts";

const NOW = Date.UTC(2026, 8, 20, 4, 0, 0);
const SETTLED = (NOW - 72 * 60 * 60 * 1000) / 1000;
const FRESH = (NOW - 60 * 60 * 1000) / 1000;
const HOURS_AGO = (hours: number) => new Date(NOW - hours * 60 * 60 * 1000).toISOString();
const DAYS_AGO = (days: number) => HOURS_AGO(days * 24);

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

function media(overrides: Partial<HeldMedia> = {}): HeldMedia {
  return {
    mediaType: "movie",
    serviceId: 11,
    title: "A Film",
    wanted: false,
    hasFiles: false,
    added: DAYS_AGO(15),
    queued: false,
    ...overrides,
  };
}

function decide(state: Partial<SweepState>, limits: SweepLimits = DEFAULT_LIMITS) {
  return planSweep({ torrents: [], queue: [], media: [], ...state }, limits, NOW);
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
  const [action] = decide({ torrents }, { ...DEFAULT_LIMITS, maxDeletes: 2 });

  expect(action?.kind).toBe("flag");
  if (action?.kind === "flag") expect(action.reason).toContain("held back");
});

test("a sweep that wants more bytes than it may free deletes nothing", () => {
  const torrents = [torrent({ imports: [] }), torrent({ hash: "H2", name: "Film 2", imports: [] })];
  const decided = decide({ torrents }, { ...DEFAULT_LIMITS, maxBytes: 1024 });

  expect(decided.every((action) => action.kind === "flag")).toBe(true);
});

test.each(["movie", "series"] as const)(
  "a %s nobody wants with nothing on disk is removed",
  (mediaType) => {
    expect(decide({ media: [media({ mediaType })] })).toEqual([
      {
        kind: "remove-media",
        mediaType,
        serviceId: 11,
        subject: "A Film",
        reason: "nothing on disk, and nothing monitored",
      },
    ]);
  },
);

test.each([
  ["still wanted", { wanted: true }],
  ["holding files", { hasFiles: true }],
  ["in a queue", { queued: true }],
  ["added recently", { added: DAYS_AGO(13) }],
  ["of unknown age", { added: "" }],
])("a title %s is kept", (_, overrides) => {
  expect(decide({ media: [media(overrides)] })).toEqual([]);
});

test("a sweep that wants more removals than it may do removes nothing", () => {
  const titles = [1, 2, 3].map((n) => media({ serviceId: n, title: `Film ${n}` }));
  const decided = decide({ media: titles }, { ...DEFAULT_LIMITS, maxRemovals: 2 });

  expect(decided.every((action) => action.kind === "flag")).toBe(true);
  expect(decided[0]?.reason).toContain("held back");
});
