import { getServerAccountNames, type PlexPerson } from "./access.ts";
import type { Watcher } from "#shared/types.ts";
import { listPlexTitles, tmdbIdOf } from "./catalog.ts";
import { episodeWatchKey, titleKey, watchKey } from "./keys.ts";
import { pmsRequest } from "./server.ts";
import { createLogger } from "#server/logger.ts";
import { errorMessage } from "#server/errors.ts";

const log = createLogger("plex-history");

const CACHE_TTL_MS = 10 * 60 * 1000;

export { episodeWatchKey, titleKey, watchKey };

export interface HistoryEntry {
  type: string;
  accountID: number;
  title?: string;
  librarySectionID?: string;
  ratingKey?: string | null;
  /** Episodes carry their series as a path; `grandparentRatingKey` is not sent. */
  grandparentKey?: string | null;
  grandparentTitle?: string;
  /** Episode number within its season. */
  index?: number;
  /** Season number. */
  parentIndex?: number;
  /** Seconds since the epoch, as Plex counts them. */
  viewedAt?: number;
}

export interface TitleIndex {
  byRatingKey: Map<string, string>;
  /** Keyed by section and title, for history rows that have lost their ids. */
  byTitle: Map<string, string>;
}

/**
 * The episode a history row refers to, by number rather than by id.
 *
 * Deleting an episode file strips its ids, which is most of the history here,
 * but the season and episode numbers survive on every row.
 */
export function resolveEpisodeKey(entry: HistoryEntry, seriesKey: string): string | undefined {
  if (entry.type !== "episode") return undefined;

  const { index: episodeNumber, parentIndex: seasonNumber } = entry;
  if (episodeNumber === undefined || seasonNumber === undefined) return undefined;
  if (!Number.isInteger(episodeNumber) || !Number.isInteger(seasonNumber)) return undefined;

  return episodeWatchKey(seriesKey, seasonNumber, episodeNumber);
}

export { tmdbIdOf };

/** The last path segment of `/library/metadata/14026`. */
export function ratingKeyOfPath(path: string | null | undefined): string | undefined {
  return path?.split("/").pop() || undefined;
}

/**
 * Plex's own identifiers mapped onto TMDB ids, from the same listing the
 * catalog is built from. `?guid=` cannot be filtered on current agents, so
 * each section is listed and indexed instead.
 */
async function buildTitleIndex(): Promise<TitleIndex> {
  const index: TitleIndex = { byRatingKey: new Map(), byTitle: new Map() };

  for (const title of await listPlexTitles()) {
    if (!title.tmdbId) continue;
    const key = watchKey(title.mediaType, title.tmdbId);
    index.byRatingKey.set(title.ratingKey, key);
    index.byTitle.set(titleKey(title.sectionKey, title.title), key);
  }

  return index;
}

/**
 * Which library title a history row refers to.
 *
 * Deleting an episode file strips the ids from its history rows while leaving
 * the series itself in place, so the title is the only link left. Ignoring
 * those rows loses most of the history on a server where watched episodes are
 * cleaned up.
 */
export function resolveHistoryKey(entry: HistoryEntry, index: TitleIndex): string | undefined {
  const isEpisode = entry.type === "episode";

  const ratingKey = isEpisode ? ratingKeyOfPath(entry.grandparentKey) : entry.ratingKey;
  const byKey = ratingKey ? index.byRatingKey.get(ratingKey) : undefined;
  if (byKey) return byKey;

  const title = isEpisode ? entry.grandparentTitle : entry.title;
  if (!title || !entry.librarySectionID) return undefined;

  return index.byTitle.get(titleKey(entry.librarySectionID, title));
}

function toWatcher(person: PlexPerson | undefined, viewedAt: number): Watcher | undefined {
  if (!person) return undefined;
  if (viewedAt <= 0) return person;
  return { ...person, watchedAt: new Date(viewedAt * 1000).toISOString() };
}

/** Most recent first, so the newest play heads the list. */
function byMostRecent(a: Watcher, b: Watcher): number {
  return (b.watchedAt ?? "").localeCompare(a.watchedAt ?? "");
}

async function buildWatchers(): Promise<Map<string, Watcher[]>> {
  const [index, names, history] = await Promise.all([
    buildTitleIndex(),
    getServerAccountNames(),
    pmsRequest<{ MediaContainer: { Metadata?: HistoryEntry[] } }>(
      "/status/sessions/history/all?sort=viewedAt:desc",
    ),
  ]);

  // Accumulate each account's latest play per title first, so one person
  // watching a whole series counts once rather than once per episode.
  const accountsByKey = new Map<string, Map<string, number>>();

  const record = (key: string, entry: HistoryEntry): void => {
    const accounts = accountsByKey.get(key) ?? new Map<string, number>();
    const id = String(entry.accountID);
    const seen = accounts.get(id) ?? 0;
    accounts.set(id, Math.max(seen, entry.viewedAt ?? 0));
    accountsByKey.set(key, accounts);
  };

  for (const entry of history.MediaContainer.Metadata ?? []) {
    const key = resolveHistoryKey(entry, index);
    if (!key) continue;

    record(key, entry);

    const episode = resolveEpisodeKey(entry, key);
    if (episode) record(episode, entry);
  }

  const watchers = new Map<string, Watcher[]>();
  for (const [key, accounts] of accountsByKey) {
    const people = [...accounts]
      .map(([id, viewedAt]) => toWatcher(names.get(id), viewedAt))
      .filter((person) => person !== undefined)
      .sort(byMostRecent);
    if (people.length > 0) watchers.set(key, people);
  }

  log.info("built plex watch index", {
    titles: index.byRatingKey.size,
    watched: watchers.size,
    people: names.size,
  });
  return watchers;
}

let cached: { value: Map<string, Watcher[]>; expires: number } | null = null;

/**
 * Who has watched each title, keyed by media type and TMDB id. An unreachable
 * server yields an empty map, which simply shows no avatars.
 */
export async function getWatchers(): Promise<Map<string, Watcher[]>> {
  if (cached && cached.expires > Date.now()) return cached.value;

  try {
    const value = await buildWatchers();
    cached = { value, expires: Date.now() + CACHE_TTL_MS };
    return value;
  } catch (error) {
    log.error("could not read plex watch history", { error: errorMessage(error) });
    return new Map();
  }
}

export function invalidateWatchers(): void {
  cached = null;
}
