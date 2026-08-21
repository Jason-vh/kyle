import type { LibraryAvailability, LibraryItem, LibraryMediaType } from "../../shared/types.ts";
import type { RadarrMovie } from "../radarr/types.ts";
import type { SonarrSeries } from "../sonarr/types.ts";
import * as radarr from "../radarr/api.ts";
import * as sonarr from "../sonarr/api.ts";
import { getAllRequesters } from "../db/requests.ts";
import { getWatchers, watchKey } from "../plex/history.ts";
import { createLogger } from "../logger.ts";
import { errorMessage } from "../errors.ts";

const log = createLogger("library");

interface ImageBearing {
  images?: { coverType?: string; remoteUrl?: string }[];
}

function posterOf(item: ImageBearing): string | undefined {
  return item.images?.find((image) => image.coverType === "poster")?.remoteUrl;
}

function toMovie(movie: RadarrMovie): LibraryItem {
  return {
    mediaType: "movie",
    serviceId: movie.id,
    tmdbId: movie.tmdbId,
    title: movie.title,
    year: movie.year || undefined,
    posterUrl: posterOf(movie),
    monitored: movie.monitored,
    sizeOnDisk: movie.sizeOnDisk ?? 0,
    availability: movie.hasFile ? "available" : "missing",
    requestedBy: [],
    requestedByMe: false,
    watchedBy: [],
  };
}

/** A series is partial until every episode Sonarr counts is on disk. */
function seriesAvailability(present: number, total: number): LibraryAvailability {
  if (present === 0) return "missing";
  return present >= total ? "available" : "partial";
}

function toSeries(series: SonarrSeries): LibraryItem {
  const present = series.statistics?.episodeFileCount ?? 0;
  const total = series.statistics?.episodeCount ?? 0;

  return {
    mediaType: "series",
    serviceId: series.id,
    tmdbId: series.tmdbId,
    title: series.title,
    year: series.year || undefined,
    posterUrl: posterOf(series),
    monitored: series.monitored,
    sizeOnDisk: series.statistics?.sizeOnDisk ?? 0,
    availability: seriesAvailability(present, total),
    detail: total > 0 ? `${present}/${total} episodes` : undefined,
    requestedBy: [],
    requestedByMe: false,
    watchedBy: [],
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

export const __testing = { toMovie, toSeries, seriesAvailability, annotateRequesters };
