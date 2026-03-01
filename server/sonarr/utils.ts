import type {
  SonarrCalendarEpisode,
  SonarrEpisode,
  SonarrHistoryItem,
  SonarrQueueItem,
  SonarrSeries,
} from "./types.ts";

export function toPartialSeries(series: SonarrSeries) {
  return {
    id: series.id,
    title: series.title,
    year: series.year,
    status: series.status,
    overview: series.overview,
    monitored: series.monitored,
    seasonCount: series.seasons.length,
    sizeOnDisk: series.statistics?.sizeOnDisk ?? 0,
    seasons: series.seasons
      .filter((s) => (s.statistics?.sizeOnDisk ?? 0) > 0)
      .map((s) => ({
        seasonNumber: s.seasonNumber,
        monitored: s.monitored,
        sizeOnDisk: s.statistics!.sizeOnDisk,
      })),
    tvdbId: series.tvdbId,
    imdbId: series.imdbId,
    titleSlug: series.titleSlug,
  };
}

export function toPartialEpisode(episode: SonarrEpisode) {
  return {
    id: episode.id,
    seriesId: episode.seriesId,
    seasonNumber: episode.seasonNumber,
    episodeNumber: episode.episodeNumber,
    title: episode.title,
    airDate: episode.airDate,
    hasFile: episode.hasFile,
    monitored: episode.monitored,
    tvdbId: episode.tvdbId,
  };
}

export function toPartialQueueItem(item: SonarrQueueItem) {
  return {
    id: item.id,
    series: toPartialSeries(item.series),
    episode: toPartialEpisode(item.episode),
    status: item.status,
    estimatedCompletionTime: item.estimatedCompletionTime,
    quality: item.quality.quality.name,
    tvdbId: item.episode.tvdbId,
  };
}

export function toPartialCalendarEpisode(episode: SonarrCalendarEpisode) {
  return {
    id: episode.id,
    seriesId: episode.seriesId,
    seasonNumber: episode.seasonNumber,
    episodeNumber: episode.episodeNumber,
    title: episode.title,
    airDate: episode.airDate,
    airDateUtc: episode.airDateUtc,
    hasFile: episode.hasFile,
    monitored: episode.monitored,
    series: toPartialSeries(episode.series),
    tvdbId: episode.tvdbId,
  };
}

export function toPartialHistoryItem(item: SonarrHistoryItem) {
  return {
    id: item.id,
    episodeId: item.episodeId,
    seriesId: item.seriesId,
    sourceTitle: item.sourceTitle,
    quality: item.quality.quality.name,
    date: item.date,
    eventType: item.eventType.name,
    series: toPartialSeries(item.series),
    episode: toPartialEpisode(item.episode),
  };
}
