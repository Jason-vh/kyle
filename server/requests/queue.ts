import type { DownloadState } from "#shared/types.ts";

/** What a title's download is doing, as opposed to where its file is. */
export type QueueState = DownloadState;

export interface QueueStatus {
  state: QueueState;
  /** What the service says about it: a stall, a rejection, a bad file. */
  detail?: string;
  /** ISO 8601 of when it joined the queue. */
  since?: string;
  /** 0–1, while downloading. */
  progress?: number;
  eta?: string;
}

/** The part of a queue record a state is read from; Radarr and Sonarr agree on it. */
export interface QueueRecord {
  status?: string;
  trackedDownloadStatus?: string;
  trackedDownloadState?: string;
  statusMessages?: { title: string; messages?: string[] }[];
  errorMessage?: string;
  size?: number;
  sizeleft?: number;
  timeleft?: string;
  added?: string;
}

/** Downloaded, but sitting in the client until somebody sorts it out. */
const BLOCKED_STATES = new Set(["importpending", "importblocked", "failedpending", "failed"]);

const IMPORTING_STATES = new Set(["importing", "imported"]);

const BLOCKED_STATUSES = new Set(["failed", "downloadclientunavailable"]);

function lower(value: string | undefined): string {
  return value?.toLowerCase() ?? "";
}

/** The first thing the service has to say about the record, in its own words. */
function reasonFor(record: QueueRecord): string | undefined {
  if (record.errorMessage) return record.errorMessage;

  const [message] = record.statusMessages ?? [];
  if (!message) return undefined;

  return message.messages?.[0] ?? message.title;
}

function progressOf(record: QueueRecord): Pick<QueueStatus, "progress" | "eta"> {
  if (!record.size || record.sizeleft === undefined) return {};
  return { progress: 1 - record.sizeleft / record.size, eta: record.timeleft };
}

/**
 * One queue record read as a state. A warning about a finished download is a
 * blocked import; a warning about an unfinished one is a stall.
 */
export function classify(record: QueueRecord): QueueStatus {
  const state = lower(record.trackedDownloadState);
  const status = lower(record.status);
  const common = { detail: reasonFor(record), since: record.added };

  if (BLOCKED_STATES.has(state) || BLOCKED_STATUSES.has(status)) {
    return { state: "blocked", ...common };
  }
  if (IMPORTING_STATES.has(state)) return { state: "importing", since: record.added };
  if (status === "delay") return { state: "found", ...common };

  if (lower(record.trackedDownloadStatus) !== "ok" && common.detail) {
    return { state: "stalled", ...common, ...progressOf(record) };
  }
  if (status === "warning" || status === "paused") {
    return { state: "stalled", ...common, ...progressOf(record) };
  }

  return { state: "downloading", since: record.added, ...progressOf(record) };
}

/** Attention first: what somebody would have to act on before anything else moves. */
const ATTENTION: Record<QueueState, number> = {
  blocked: 4,
  stalled: 3,
  downloading: 2,
  found: 1,
  importing: 0,
};

function beats(next: QueueStatus, current: QueueStatus): boolean {
  if (ATTENTION[next.state] !== ATTENTION[current.state]) {
    return ATTENTION[next.state] > ATTENTION[current.state];
  }
  return (next.progress ?? 0) > (current.progress ?? 0);
}

/**
 * What a title's queue amounts to. A movie has one record, a series one per
 * episode: of those, the one needing a hand wins, and among equals the
 * furthest along, since it is the next thing that becomes watchable.
 */
export function summarise(records: QueueRecord[]): QueueStatus | undefined {
  let best: QueueStatus | undefined;

  for (const record of records) {
    const next = classify(record);
    if (!best || beats(next, best)) best = next;
  }

  return best;
}
