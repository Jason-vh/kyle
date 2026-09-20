import type { LibraryMediaType } from "#shared/types.ts";
import type { QueueStatus } from "#server/requests/queue.ts";

/** A torrent, and what the services say it produced. */
export interface TorrentOrigin {
  hash: string;
  name: string;
  bytes: number;
  /** Seconds since the epoch, as qBittorrent reports it; 0 while unfinished. */
  completedAt: number;
  /** False for a torrent neither service has any history of. */
  known: boolean;
  /** Files this torrent imported, and whether the service still holds each one. */
  imports: { fileId: number; alive: boolean }[];
  /** In a service's queue, so it is being worked on rather than left behind. */
  queued: boolean;
}

/** A download a service is still trying to finish, read as a state. */
export interface QueueEntry {
  mediaType: LibraryMediaType;
  queueId: number;
  serviceId: number;
  title: string;
  status: QueueStatus;
}

export interface SweepState {
  torrents: TorrentOrigin[];
  queue: QueueEntry[];
}

export type JanitorAction =
  | { kind: "delete-torrent"; hash: string; subject: string; bytes: number; reason: string }
  | {
      kind: "retry-download";
      mediaType: LibraryMediaType;
      queueId: number;
      serviceId: number;
      subject: string;
      reason: string;
    }
  | {
      kind: "discard-download";
      mediaType: LibraryMediaType;
      queueId: number;
      subject: string;
      reason: string;
    }
  | { kind: "flag"; subject: string; bytes: number; reason: string };

export interface SweepLimits {
  /** How long a finished torrent is left alone, so an import in progress is never cut off. */
  graceMs: number;
  /** How long a download may sit stalled before it is given up on. */
  stalledAfterMs: number;
  maxDeletes: number;
  maxBytes: number;
}

export const DEFAULT_LIMITS: SweepLimits = {
  graceMs: 48 * 60 * 60 * 1000,
  stalledAfterMs: 12 * 60 * 60 * 1000,
  maxDeletes: 40,
  maxBytes: 2 * 1024 ** 4,
};

/**
 * Releases whose file is already in the library, under another name. Kyle
 * cannot import them and neither can anybody else, so they are worth
 * blocklisting rather than waiting on.
 */
const HOPELESS_IMPORTS = [
  /\.exe\b/i,
  /\.scr\b/i,
  /\bsample\b/i,
  /already been imported/i,
  /no files found are eligible/i,
];

function hopeless(detail: string | undefined): boolean {
  if (!detail) return false;
  return HOPELESS_IMPORTS.some((pattern) => pattern.test(detail));
}

function ageMs(since: string | undefined, now: number): number {
  if (!since) return 0;
  const started = Date.parse(since);
  return Number.isNaN(started) ? 0 : now - started;
}

/**
 * What a torrent is doing for us, if anything. A torrent that imported files
 * the service has since replaced is seeding a copy of nothing; one that never
 * imported anything, is in no queue and has had its chance, is the same.
 */
function torrentAction(
  torrent: TorrentOrigin,
  limits: SweepLimits,
  now: number,
): JanitorAction | undefined {
  const subject = torrent.name;
  const common = { hash: torrent.hash, subject, bytes: torrent.bytes };

  if (!torrent.known) {
    return {
      kind: "flag",
      subject,
      bytes: torrent.bytes,
      reason: "neither Radarr nor Sonarr has heard of it — somebody added it by hand",
    };
  }

  if (torrent.queued) return undefined;

  const settled = torrent.completedAt > 0 && now - torrent.completedAt * 1000 >= limits.graceMs;
  if (!settled) return undefined;

  if (torrent.imports.length === 0) {
    return { kind: "delete-torrent", ...common, reason: "grabbed, but nothing was ever imported" };
  }

  if (torrent.imports.every((file) => !file.alive)) {
    return {
      kind: "delete-torrent",
      ...common,
      reason: "the library no longer holds the file it imported",
    };
  }

  return undefined;
}

function queueAction(
  entry: QueueEntry,
  limits: SweepLimits,
  now: number,
): JanitorAction | undefined {
  const { state, detail, since } = entry.status;
  const waited = ageMs(since, now);

  if (state === "stalled" && waited >= limits.stalledAfterMs) {
    return {
      kind: "retry-download",
      mediaType: entry.mediaType,
      queueId: entry.queueId,
      serviceId: entry.serviceId,
      subject: entry.title,
      reason: detail ?? "stalled, and no further along than hours ago",
    };
  }

  if (state !== "blocked" || waited < limits.graceMs) return undefined;

  if (hopeless(detail)) {
    return {
      kind: "discard-download",
      mediaType: entry.mediaType,
      queueId: entry.queueId,
      subject: entry.title,
      reason: detail ?? "nothing in it can be imported",
    };
  }

  return {
    kind: "flag",
    subject: entry.title,
    bytes: 0,
    reason: `import blocked, and not for a reason Kyle knows: ${detail ?? "no reason given"}`,
  };
}

function isDeletion(
  action: JanitorAction,
): action is Extract<JanitorAction, { kind: "delete-torrent" }> {
  return action.kind === "delete-torrent";
}

/**
 * A sweep that wants to delete far more than a night's worth has almost
 * certainly misread something — a service answering oddly, a library half
 * migrated — so it deletes nothing and says what it wanted to do. A night of
 * no cleanup is cheap; a night of wrong cleanup is not.
 */
function withinLimits(actions: JanitorAction[], limits: SweepLimits): JanitorAction[] {
  const deletions = actions.filter(isDeletion);
  const bytes = deletions.reduce((total, action) => total + action.bytes, 0);

  if (deletions.length <= limits.maxDeletes && bytes <= limits.maxBytes) return actions;

  const reason = `held back: this sweep wanted to delete ${deletions.length} torrents (${bytes} bytes), past what one run may do`;

  return actions.map((action) => {
    if (!isDeletion(action)) return action;
    return { kind: "flag", subject: action.subject, bytes: action.bytes, reason };
  });
}

/** Everything the sweep would do, decided from state alone. */
export function planSweep(
  state: SweepState,
  limits: SweepLimits = DEFAULT_LIMITS,
  now: number = Date.now(),
): JanitorAction[] {
  const actions = [
    ...state.torrents.map((torrent) => torrentAction(torrent, limits, now)),
    ...state.queue.map((entry) => queueAction(entry, limits, now)),
  ].filter((action) => action !== undefined);

  return withinLimits(actions, limits);
}
