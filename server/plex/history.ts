import { getServerAccountNames, type PlexPerson } from "./access.ts";
import { pmsRequest } from "./server.ts";
import { createLogger } from "../logger.ts";
import { errorMessage } from "../errors.ts";

const log = createLogger("plex-history");

const CACHE_TTL_MS = 10 * 60 * 1000;

interface SectionsResponse {
  MediaContainer: { Directory?: { key: string; type: string }[] };
}

interface SectionItem {
  ratingKey: string;
  title: string;
  Guid?: { id: string }[];
}

export interface HistoryEntry {
  type: string;
  accountID: number;
  title?: string;
  librarySectionID?: string;
  ratingKey?: string | null;
  /** Episodes carry their series as a path; `grandparentRatingKey` is not sent. */
  grandparentKey?: string | null;
  grandparentTitle?: string;
}

export interface TitleIndex {
  byRatingKey: Map<string, string>;
  /** Keyed by section and title, for history rows that have lost their ids. */
  byTitle: Map<string, string>;
}

/** `movie:550` — the two services number their ids independently. */
export function watchKey(mediaType: string, tmdbId: number): string {
  return `${mediaType}:${tmdbId}`;
}

function titleKey(sectionKey: string, title: string): string {
  return `${sectionKey}:${title.toLowerCase()}`;
}

function tmdbIdOf(item: SectionItem): number | undefined {
  const guid = item.Guid?.find((g) => g.id.startsWith("tmdb://"));
  const id = Number(guid?.id.slice("tmdb://".length));
  return Number.isInteger(id) && id > 0 ? id : undefined;
}

/** The last path segment of `/library/metadata/14026`. */
function ratingKeyOfPath(path: string | null | undefined): string | undefined {
  return path?.split("/").pop() || undefined;
}

/**
 * Plex's own identifiers mapped onto TMDB ids. `?guid=` cannot be filtered on
 * current agents, so each section is listed and indexed instead.
 */
async function buildTitleIndex(): Promise<TitleIndex> {
  const sections = await pmsRequest<SectionsResponse>("/library/sections");
  const index: TitleIndex = { byRatingKey: new Map(), byTitle: new Map() };

  for (const section of sections.MediaContainer.Directory ?? []) {
    const mediaType =
      section.type === "movie" ? "movie" : section.type === "show" ? "series" : null;
    if (!mediaType) continue;

    const listing = await pmsRequest<{ MediaContainer: { Metadata?: SectionItem[] } }>(
      `/library/sections/${section.key}/all?includeGuids=1`,
    );

    for (const item of listing.MediaContainer.Metadata ?? []) {
      const tmdbId = tmdbIdOf(item);
      if (!tmdbId) continue;
      const key = watchKey(mediaType, tmdbId);
      index.byRatingKey.set(item.ratingKey, key);
      index.byTitle.set(titleKey(section.key, item.title), key);
    }
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

async function buildWatchers(): Promise<Map<string, PlexPerson[]>> {
  const [index, names, history] = await Promise.all([
    buildTitleIndex(),
    getServerAccountNames(),
    pmsRequest<{ MediaContainer: { Metadata?: HistoryEntry[] } }>(
      "/status/sessions/history/all?sort=viewedAt:desc",
    ),
  ]);

  // Accumulate account ids per title first, so one person watching a whole
  // series counts once rather than once per episode.
  const accountsByKey = new Map<string, Set<string>>();

  for (const entry of history.MediaContainer.Metadata ?? []) {
    const key = resolveHistoryKey(entry, index);
    if (!key) continue;

    const accounts = accountsByKey.get(key) ?? new Set<string>();
    accounts.add(String(entry.accountID));
    accountsByKey.set(key, accounts);
  }

  const watchers = new Map<string, PlexPerson[]>();
  for (const [key, accounts] of accountsByKey) {
    const people = [...accounts]
      .map((id) => names.get(id))
      .filter((person) => person !== undefined);
    if (people.length > 0) watchers.set(key, people);
  }

  log.info("built plex watch index", {
    titles: index.byRatingKey.size,
    watched: watchers.size,
    people: names.size,
  });
  return watchers;
}

let cached: { value: Map<string, PlexPerson[]>; expires: number } | null = null;

/**
 * Who has watched each title, keyed by media type and TMDB id. An unreachable
 * server yields an empty map, which simply shows no avatars.
 */
export async function getWatchers(): Promise<Map<string, PlexPerson[]>> {
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

export const __testing = { tmdbIdOf, ratingKeyOfPath, titleKey };
