import type { LibraryAvailability, LibraryItem, LibraryMediaType } from "../../shared/types.ts";
import type { RadarrMovie } from "../radarr/types.ts";
import type { SonarrSeries } from "../sonarr/types.ts";
import * as radarr from "../radarr/api.ts";
import * as sonarr from "../sonarr/api.ts";
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
  };
}

/** Everything Radarr and Sonarr hold, newest-looking first is left to the caller. */
export async function listLibrary(): Promise<LibraryItem[]> {
  const [movies, series] = await Promise.all([radarr.getMovies(), sonarr.getAllSeries()]);

  return [...movies.map(toMovie), ...series.map(toSeries)].sort((a, b) =>
    a.title.localeCompare(b.title),
  );
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

export const __testing = { toMovie, toSeries, seriesAvailability };
