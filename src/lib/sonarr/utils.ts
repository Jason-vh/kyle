import { SonarrEpisode, SonarrQueueItem, SonarrSeries } from "./types";

/**
 * Convert a full series object to a partial representation for AI tools.
 */
export function toPartialSeries(series: SonarrSeries) {
	return {
		id: series.id,
		title: series.title,
		year: series.year,
		status: series.status,
		overview: series.overview,
		monitored: series.monitored,
		seasonCount: series.seasons.length,
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
	};
}
