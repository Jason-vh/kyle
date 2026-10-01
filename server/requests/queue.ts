import { episodeCode, seasonName } from "#shared/media.ts";
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
  /** The client's id for the torrent, shared by every episode it carries. */
  downloadId?: string;
  /** The release name. */
  title?: string;
  episode?: { seasonNumber: number; episodeNumber: number };
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

/** A release named for its episodes rather than its season: "S05E13-E14". */
const EPISODE_MARKER = /\bS\d+E\d+/i;

/**
 * Sonarr lists a download once per episode in it, so a season pack is many
 * records. Grouped back together, each download counts once.
 */
function byDownload(records: QueueRecord[]): QueueRecord[][] {
  const downloads = new Map<string, QueueRecord[]>();
  const unidentified: QueueRecord[][] = [];

  for (const record of records) {
    if (!record.downloadId) {
      unidentified.push([record]);
      continue;
    }
    const existing = downloads.get(record.downloadId);
    if (existing) existing.push(record);
    else downloads.set(record.downloadId, [record]);
  }

  return [...downloads.values(), ...unidentified];
}

type EpisodeNumber = NonNullable<QueueRecord["episode"]>;

function episodesOf(records: QueueRecord[]): EpisodeNumber[] {
  return records
    .flatMap((record) => (record.episode ? [record.episode] : []))
    .sort((a, b) => a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber);
}

/** A download of its own episodes, as opposed to a season pack. */
function isEpisodic(records: QueueRecord[]): boolean {
  const episodes = episodesOf(records);
  return episodes.length === 1 || EPISODE_MARKER.test(records[0]?.title ?? "");
}

/**
 * What one download carries: "S06E07", "S05E13–E14", "Season 7" or
 * "Seasons 1–5". A movie carries no episodes and so has no label, and nor does
 * a pack of the very season being summarised, which would only repeat it.
 */
function downloadLabel(records: QueueRecord[], seasonNumber?: number): string | undefined {
  const episodes = episodesOf(records);
  const first = episodes[0];
  const last = episodes.at(-1);
  if (!first || !last) return undefined;

  const firstCode = episodeCode(first.seasonNumber, first.episodeNumber);
  if (episodes.length === 1) return firstCode;

  if (first.seasonNumber !== last.seasonNumber) {
    return `Seasons ${first.seasonNumber}–${last.seasonNumber}`;
  }
  if (isEpisodic(records)) {
    return `${firstCode}–E${String(last.episodeNumber).padStart(2, "0")}`;
  }
  if (first.seasonNumber === seasonNumber) return undefined;
  return seasonName(first.seasonNumber);
}

/** "S06E07 and 34 more · The download is stalled with no connections". */
function describe(detail: string, label: string | undefined, others: number): string {
  if (!label) return detail;
  const subject = others > 0 ? `${label} and ${others} more` : label;
  return `${subject} · ${detail}`;
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

/** One download, read once for the records Sonarr lists it under. */
interface Queued {
  records: QueueRecord[];
  status: QueueStatus;
}

function queued(records: QueueRecord[]): Queued[] {
  // One download's records share a status; any of them speaks for it.
  return byDownload(records).map((download) => ({
    records: download,
    status: classify(download[0]!),
  }));
}

/**
 * The one needing a hand wins, and among equals the furthest along, since it
 * is the next thing that becomes watchable.
 */
function mostPressing(downloads: Queued[]): Queued | undefined {
  let best: Queued | undefined;
  for (const download of downloads) {
    if (!best || beats(download.status, best.status)) best = download;
  }
  return best;
}

/**
 * What a title's queue amounts to, for a line that has to speak for all of it:
 * a movie has one download, a series one per episode or season pack. Its
 * detail names the most pressing download, and how many share its state.
 * `seasonNumber` is the season being summarised, when it is just one.
 */
export function summarise(records: QueueRecord[], seasonNumber?: number): QueueStatus | undefined {
  const downloads = queued(records);
  const best = mostPressing(downloads);
  if (!best?.status.detail) return best?.status;

  const { state } = best.status;
  const others = downloads.filter((download) => download.status.state === state).length - 1;
  const label = downloadLabel(best.records, seasonNumber);
  return { ...best.status, detail: describe(best.status.detail, label, others) };
}

/**
 * A season's own row, above a row for each of its episodes. Its state is
 * everything queued for the season, but it speaks only for season packs: what
 * an episode's own download has to say is said on that episode's row.
 */
export function summariseSeason(records: QueueRecord[]): QueueStatus | undefined {
  const downloads = queued(records);
  const best = mostPressing(downloads);
  if (!best) return undefined;

  const packs = downloads.filter(
    (download) => !isEpisodic(download.records) && download.status.state === best.status.state,
  );
  return { ...best.status, detail: mostPressing(packs)?.status.detail };
}

/** "6:7", the key an episode's queue is found under. */
export function episodeKey(seasonNumber: number, episodeNumber: number): string {
  return `${seasonNumber}:${episodeNumber}`;
}

/**
 * What each episode's download is doing, by episodeKey(). An episode in a
 * season pack shares the pack's state, but not its message, which is the
 * season's to tell.
 */
export function episodeQueues(records: QueueRecord[]): Map<string, QueueStatus> {
  const episodes = new Map<string, QueueStatus>();

  for (const download of queued(records)) {
    const { detail, ...status } = download.status;
    const own = isEpisodic(download.records) ? { ...status, detail } : status;

    for (const episode of episodesOf(download.records)) {
      const key = episodeKey(episode.seasonNumber, episode.episodeNumber);
      const current = episodes.get(key);
      if (!current || beats(own, current)) episodes.set(key, own);
    }
  }

  return episodes;
}
