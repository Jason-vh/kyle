import type { LibraryAvailability, LibraryState } from "#shared/types.ts";
import type { RadarrMovie } from "#server/radarr/types.ts";
import type { SonarrSeries } from "#server/sonarr/types.ts";

/** A series is partial until every episode Sonarr counts is on disk. */
export function seriesAvailability(present: number, total: number): LibraryAvailability {
  if (present === 0) return "missing";
  return present >= total ? "available" : "partial";
}

export function movieState(movie: RadarrMovie): LibraryState {
  return {
    serviceId: movie.id,
    monitored: movie.monitored,
    sizeOnDisk: movie.sizeOnDisk ?? 0,
    availability: movie.hasFile ? "available" : "missing",
  };
}

export function seriesState(series: SonarrSeries): LibraryState {
  const present = series.statistics?.episodeFileCount ?? 0;
  const total = series.statistics?.episodeCount ?? 0;

  return {
    serviceId: series.id,
    monitored: series.monitored,
    sizeOnDisk: series.statistics?.sizeOnDisk ?? 0,
    availability: seriesAvailability(present, total),
    detail: total > 0 ? `${present}/${total} episodes` : undefined,
  };
}
