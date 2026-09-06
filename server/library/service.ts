import type { LibraryItem, LibraryMediaType } from "#shared/types.ts";
import type { RadarrMovie } from "#server/radarr/types.ts";
import type { SonarrSeries } from "#server/sonarr/types.ts";
import * as radarr from "#server/radarr/api.ts";
import * as sonarr from "#server/sonarr/api.ts";
import { movieState, seriesState } from "./item.ts";
import { getAllRequesters } from "#server/db/requests.ts";
import { getWatchers, watchKey } from "#server/plex/history.ts";
import { posterOf } from "#server/media-images.ts";
import { createLogger } from "#server/logger.ts";
import { errorMessage } from "#server/errors.ts";

const log = createLogger("library");

function toMovie(movie: RadarrMovie): LibraryItem {
  return {
    mediaType: "movie",
    tmdbId: movie.tmdbId,
    title: movie.title,
    year: movie.year || undefined,
    posterUrl: posterOf(movie),
    requestedBy: [],
    requestedByMe: false,
    watchedBy: [],
    ...movieState(movie),
  };
}

function toSeries(series: SonarrSeries): LibraryItem {
  return {
    mediaType: "series",
    tmdbId: series.tmdbId,
    title: series.title,
    year: series.year || undefined,
    posterUrl: posterOf(series),
    requestedBy: [],
    requestedByMe: false,
    watchedBy: [],
    ...seriesState(series),
  };
}

function requestKey(mediaType: string, tmdbId: number): string {
  return `${mediaType}:${tmdbId}`;
}

interface Requester {
  mediaType: string;
  tmdbId: number;
  userId: string;
  name: string;
}

/**
 * Attach who asked for each title. Only media requested through Kyle matches;
 * anything added before, or by hand, simply has no requester.
 */
function annotateRequesters(items: LibraryItem[], viewerId: string, requests: Requester[]): void {
  if (requests.length === 0) return;

  const byKey = new Map<string, { names: string[]; mine: boolean }>();
  for (const request of requests) {
    const key = requestKey(request.mediaType, request.tmdbId);
    const entry = byKey.get(key) ?? { names: [], mine: false };
    entry.names.push(request.name);
    entry.mine ||= request.userId === viewerId;
    byKey.set(key, entry);
  }

  for (const item of items) {
    if (item.tmdbId === undefined) continue;
    const entry = byKey.get(requestKey(item.mediaType, item.tmdbId));
    if (!entry) continue;
    item.requestedBy = entry.names;
    item.requestedByMe = entry.mine;
  }
}

export interface LibraryListing {
  items: LibraryItem[];
  /** Services that could not be reached, so the listing is incomplete. */
  unavailable: string[];
}

/** Resolves to an empty list rather than failing, naming the service if it did. */
async function tryList<T>(name: string, load: () => Promise<T[]>): Promise<[T[], string?]> {
  try {
    return [await load()];
  } catch (error) {
    log.error("library source unavailable", { source: name, error: errorMessage(error) });
    return [[], name];
  }
}

/**
 * Everything Radarr and Sonarr hold, annotated with who asked for it.
 * One service being down hides its half rather than the whole library.
 */
export async function listLibrary(viewerId: string): Promise<LibraryListing> {
  const [[movies, moviesDown], [series, seriesDown]] = await Promise.all([
    tryList("Radarr", radarr.getMovies),
    tryList("Sonarr", sonarr.getAllSeries),
  ]);

  const unavailable = [moviesDown, seriesDown].filter((name) => name !== undefined);

  const items = [...movies.map(toMovie), ...series.map(toSeries)].sort((a, b) =>
    a.title.localeCompare(b.title),
  );

  const [requesters, watchers] = await Promise.all([getAllRequesters(), getWatchers()]);
  annotateRequesters(items, viewerId, requesters);

  for (const item of items) {
    if (item.tmdbId === undefined) continue;
    item.watchedBy = watchers.get(watchKey(item.mediaType, item.tmdbId)) ?? [];
  }

  return { items, unavailable };
}

/** Remove an item from its service, optionally deleting the files with it. */
export async function removeLibraryItem(
  mediaType: LibraryMediaType,
  serviceId: number,
  deleteFiles: boolean,
): Promise<void> {
  if (mediaType === "movie") {
    await radarr.removeMovie(serviceId, deleteFiles);
  } else {
    await sonarr.removeSeries(serviceId, deleteFiles);
  }

  log.info("removed library item", { mediaType, serviceId, deleteFiles });
}

export const __testing = { toMovie, toSeries, annotateRequesters };
