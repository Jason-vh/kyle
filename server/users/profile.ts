import { and, desc, eq, isNull, or } from "drizzle-orm";
import type {
  LibraryItem,
  UserInvite,
  UserProfile,
  UserRemoval,
  UserStorage,
  WatchedTitle,
} from "#shared/types.ts";
import { isLibraryMediaType } from "#shared/types.ts";
import { episodeLabel } from "#shared/media.ts";
import * as radarr from "#server/radarr/api.ts";
import * as sonarr from "#server/sonarr/api.ts";
import { db } from "#server/db/index.ts";
import { mediaRemovals, plexInvites } from "#server/db/schema.ts";
import { getMediaRequestsForUser } from "#server/db/requests.ts";
import { getPlatformIdentity, getPlexAccountIds } from "#server/db/users.ts";
import { listThreadSummaries } from "#server/db/threads.ts";
import { toThreadListItem } from "#server/threads/summaries.ts";
import { toMovie, toSeries } from "#server/library/service.ts";
import { attachPosters } from "#server/tmdb/artwork.ts";
import { withState } from "#server/requests/state.ts";
import { getPlaysBy, getWatchers, watchKey, type TitlePlay } from "#server/plex/history.ts";
import type { Viewer } from "#server/people.ts";
import { getAdminUser } from "./directory.ts";
import { createLogger } from "#server/logger.ts";
import { errorMessage } from "#server/errors.ts";

const log = createLogger("user-profile");

const RECENT_TITLES = 20;
const RECENT_CONVERSATIONS = 10;

interface Library {
  items: Map<string, LibraryItem>;
  reachable: boolean;
  unavailable: string[];
}

async function tryList<T>(name: string, load: () => Promise<T[]>): Promise<T[] | undefined> {
  try {
    return await load();
  } catch (error) {
    log.warn("library source unavailable", { source: name, error: errorMessage(error) });
    return undefined;
  }
}

async function library(): Promise<Library> {
  const [movies, series] = await Promise.all([
    tryList("Radarr", radarr.getMovies),
    tryList("Sonarr", sonarr.getAllSeries),
  ]);

  const items = [...(movies ?? []).map(toMovie), ...(series ?? []).map(toSeries)];
  const byKey = new Map<string, LibraryItem>();
  for (const item of items) {
    if (item.tmdbId !== undefined) byKey.set(watchKey(item.mediaType, item.tmdbId), item);
  }

  const unavailable: string[] = [];
  if (!movies) unavailable.push("Radarr");
  if (!series) unavailable.push("Sonarr");
  return { items: byKey, reachable: !!movies || !!series, unavailable };
}

function storageOf(requested: Set<string>, { items }: Library): UserStorage {
  let requestedBytes = 0;
  let libraryBytes = 0;
  for (const [key, item] of items) {
    libraryBytes += item.sizeOnDisk;
    if (requested.has(key)) requestedBytes += item.sizeOnDisk;
  }
  return { requestedBytes, libraryBytes };
}

/** "S02E05 Half Loop · 14 episodes", or how often a film was watched. */
function watchedDetail(plays: TitlePlay[]): string | undefined {
  const [latest] = plays;
  if (!latest) return undefined;

  if (latest.episode) {
    const { seasonNumber, episodeNumber, title } = latest.episode;
    const episodes = new Set(
      plays.map((play) => `${play.episode?.seasonNumber}:${play.episode?.episodeNumber}`),
    );
    const label = episodeLabel(seasonNumber, episodeNumber, title);
    return episodes.size > 1 ? `${label} · ${episodes.size} episodes` : label;
  }

  return plays.length > 1 ? `Watched ${plays.length} times` : undefined;
}

/** One line per title, most recently watched first. */
export function watchedTitles(plays: TitlePlay[], items: Map<string, LibraryItem>): WatchedTitle[] {
  const byKey = new Map<string, TitlePlay[]>();
  for (const play of plays) byKey.set(play.key, [...(byKey.get(play.key) ?? []), play]);

  const titles: WatchedTitle[] = [];
  for (const [key, titlePlays] of byKey) {
    const [mediaType, id] = key.split(":");
    const latest = titlePlays[0];
    if (!latest || !mediaType || !isLibraryMediaType(mediaType)) continue;

    const item = items.get(key);
    titles.push({
      mediaType,
      tmdbId: Number(id) || undefined,
      title: item?.title ?? latest.title ?? "Unknown title",
      year: item?.year,
      at: latest.at,
      detail: watchedDetail(titlePlays),
    });
    if (titles.length === RECENT_TITLES) break;
  }
  return titles;
}

async function invitesOf(userId: string): Promise<UserInvite[]> {
  const rows = await db
    .select()
    .from(plexInvites)
    .where(eq(plexInvites.invitedByUserId, userId))
    .orderBy(desc(plexInvites.createdAt));
  return rows.map((row) => ({ email: row.email, at: row.createdAt.toISOString() }));
}

/** Removals recorded before user ids were kept are matched by the name written down. */
async function removalsOf(userId: string, name: string): Promise<UserRemoval[]> {
  const rows = await db
    .select()
    .from(mediaRemovals)
    .where(
      or(
        eq(mediaRemovals.removedByUserId, userId),
        and(isNull(mediaRemovals.removedByUserId), eq(mediaRemovals.removedBy, name)),
      ),
    )
    .orderBy(desc(mediaRemovals.createdAt));
  return rows.map((row) => ({
    mediaType: row.mediaType,
    tmdbId: row.tmdbId,
    title: row.title,
    at: row.createdAt.toISOString(),
    deletedFiles: row.deletedFiles,
  }));
}

/** The linked account and any held before, since plays outlive an unlinking. */
async function plexAccountsOf(userId: string): Promise<string[]> {
  const [linked, remembered] = await Promise.all([
    getPlatformIdentity(userId, "plex"),
    getPlexAccountIds(userId),
  ]);
  return [...new Set([linked?.platformUserId, ...remembered].filter((id) => id !== undefined))];
}

function latest(dates: (string | undefined)[]): string | undefined {
  return dates
    .filter((date) => date !== undefined)
    .sort()
    .at(-1);
}

/**
 * Everything Kyle knows about one person, for an admin. Each source failing
 * costs only its own part: an unreachable service is named, not fatal.
 */
export async function getUserProfile(
  userId: string,
  viewer: Viewer,
): Promise<UserProfile | undefined> {
  const user = await getAdminUser(userId);
  if (!user) return undefined;

  const [rows, lib, plexAccounts, watchers, threads, invites, removals] = await Promise.all([
    getMediaRequestsForUser(userId),
    library(),
    plexAccountsOf(userId),
    getWatchers(),
    listThreadSummaries({ userId, limit: RECENT_CONVERSATIONS }),
    invitesOf(userId),
    removalsOf(userId, user.displayName),
  ]);

  const [requests, plays] = await Promise.all([withState(rows, viewer), getPlaysBy(plexAccounts)]);

  const requested = new Set(rows.map((row) => watchKey(row.mediaType, row.tmdbId)));
  const watched = [...requested].filter((key) => (watchers.get(key)?.length ?? 0) > 0).length;
  const conversations = threads.map(toThreadListItem);

  return {
    user,
    lastActiveAt: latest([conversations[0]?.createdAt, requests[0]?.createdAt, plays[0]?.at]),
    requests,
    requestsWatched: requested.size > 0 ? { watched, total: requested.size } : undefined,
    storage: lib.reachable ? storageOf(requested, lib) : undefined,
    watching:
      plexAccounts.length > 0
        ? {
            titles: new Set(plays.map((play) => play.key)).size,
            plays: plays.length,
            recent: await attachPosters(watchedTitles(plays, lib.items)),
          }
        : undefined,
    conversations,
    invites,
    removals,
    unavailable: lib.unavailable,
  };
}
