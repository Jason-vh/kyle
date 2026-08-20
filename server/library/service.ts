import type { LibraryAvailability, LibraryItem, LibraryMediaType } from "../../shared/types.ts";
import type { RadarrMovie } from "../radarr/types.ts";
import type { SonarrSeries } from "../sonarr/types.ts";
import * as radarr from "../radarr/api.ts";
import * as sonarr from "../sonarr/api.ts";
import { getAllRequesters } from "../db/requests.ts";
import { getWatchers, watchKey } from "../plex/history.ts";
import { createLogger } from "../logger.ts";

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

/** Everything Radarr and Sonarr hold, annotated with who asked for it. */
export async function listLibrary(viewerId: string): Promise<LibraryItem[]> {
  const [movies, series] = await Promise.all([radarr.getMovies(), sonarr.getAllSeries()]);

  const items = [...movies.map(toMovie), ...series.map(toSeries)].sort((a, b) =>
    a.title.localeCompare(b.title),
  );

  const [requesters, watchers] = await Promise.all([getAllRequesters(), getWatchers()]);
  annotateRequesters(items, viewerId, requesters);

  for (const item of items) {
    if (item.tmdbId === undefined) continue;
    item.watchedBy = watchers.get(watchKey(item.mediaType, item.tmdbId)) ?? [];
  }

  return items;
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
