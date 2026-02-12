import { Type } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import * as sonarr from "./api.ts";
import {
	toPartialSeries,
	toPartialEpisode,
	toPartialQueueItem,
	toPartialCalendarEpisode,
	toPartialHistoryItem,
} from "./utils.ts";

const emptyParams = Type.Object({});

export const getAllSeriesTool: AgentTool<typeof emptyParams> = {
	name: "get_all_series",
	description: "Get all TV series currently in the Sonarr library",
	parameters: emptyParams,
	label: "Fetching series from Sonarr",
	async execute() {
		const series = await sonarr.getAllSeries();
		return {
			content: [
				{ type: "text", text: JSON.stringify(series.map(toPartialSeries)) },
			],
			details: undefined,
		};
	},
};

const getSeriesByIdParams = Type.Object({
	seriesId: Type.Number({
		description: "The ID of the series to get information about",
	}),
});

export const getSeriesByIdTool: AgentTool<typeof getSeriesByIdParams> = {
	name: "get_series_by_id",
	description: "Get information about a specific TV series in Sonarr by ID",
	parameters: getSeriesByIdParams,
	label: "Checking series details in Sonarr",
	async execute(_toolCallId, params) {
		const series = await sonarr.getSeries(params.seriesId);
		return {
			content: [
				{ type: "text", text: JSON.stringify(toPartialSeries(series)) },
			],
			details: undefined,
		};
	},
};

const searchSeriesParams = Type.Object({
	title: Type.String({
		description: "The title of the TV series to search for",
	}),
});

export const searchSeriesTool: AgentTool<typeof searchSeriesParams> = {
	name: "search_series",
	description: "Search for TV series to add to Sonarr using a title",
	parameters: searchSeriesParams,
	label: "Searching for series in Sonarr",
	async execute(_toolCallId, params) {
		const series = await sonarr.searchSeries(params.title);
		return {
			content: [
				{ type: "text", text: JSON.stringify(series.map(toPartialSeries)) },
			],
			details: undefined,
		};
	},
};

const addSeriesParams = Type.Object({
	title: Type.String({ description: "The title of the series to add" }),
	year: Type.Number({ description: "The year the series started" }),
	tvdbId: Type.Number({ description: "The TVDB ID of the series to add" }),
	monitorOption: Type.Union(
		[
			Type.Literal("all"),
			Type.Literal("future"),
			Type.Literal("missing"),
			Type.Literal("existing"),
			Type.Literal("lastSeason"),
			Type.Literal("none"),
		],
		{
			description:
				"Which episodes to monitor and download: 'all' (entire series), 'lastSeason' (latest season only), 'future' (upcoming episodes), 'missing' (missing episodes), 'existing' (existing episodes), 'none' (don't download)",
		},
	),
});

export const addSeriesTool: AgentTool<typeof addSeriesParams> = {
	name: "add_series",
	description:
		"Add a TV series to Sonarr. Requires title, year, TVDB ID, and monitor option. The monitor option determines which episodes to download: 'all' for entire series, 'lastSeason' for only the latest season, 'future' for upcoming episodes only, 'missing' for missing episodes, 'existing' for existing episodes, or 'none' to add without downloading.",
	parameters: addSeriesParams,
	label: "Adding series to Sonarr",
	async execute(_toolCallId, params) {
		const series = await sonarr.addSeries(
			params.title,
			params.year,
			params.tvdbId,
			params.monitorOption,
		);
		const result = toPartialSeries(series);
		return {
			content: [
				{
					type: "text",
					text: JSON.stringify({
						series: result,
						message: `Added "${params.title}" (${params.year}) to Sonarr.`,
					}),
				},
			],
			details: undefined,
		};
	},
};

const removeSeriesParams = Type.Object({
	seriesId: Type.Number({
		description: "The ID of the series to remove",
	}),
});

export const removeSeriesTool: AgentTool<typeof removeSeriesParams> = {
	name: "remove_series",
	description:
		"Remove a TV series from Sonarr and delete the files from disk",
	parameters: removeSeriesParams,
	label: "Removing series from Sonarr",
	async execute(_toolCallId, params) {
		const series = await sonarr.getSeries(params.seriesId);
		await sonarr.removeSeries(params.seriesId, true);
		return {
			content: [
				{
					type: "text",
					text: JSON.stringify({
						success: true,
						message: `Removed ${series.title} (${series.year}) from Sonarr and deleted files from disk.`,
						title: series.title,
						tvdbId: series.tvdbId,
						tmdbId: series.tmdbId,
						imdbId: series.imdbId,
						sonarrId: params.seriesId,
					}),
				},
			],
			details: undefined,
		};
	},
};

const removeSeasonParams = Type.Object({
	seriesId: Type.Number({ description: "The ID of the series" }),
	seasonNumber: Type.Number({
		description:
			"The season number to remove (e.g., 1 for Season 1, 0 for Specials)",
	}),
});

export const removeSeasonTool: AgentTool<typeof removeSeasonParams> = {
	name: "remove_season",
	description:
		"Remove a specific season from a TV series in Sonarr and delete all episode files from disk",
	parameters: removeSeasonParams,
	label: "Removing season from Sonarr",
	async execute(_toolCallId, params) {
		const series = await sonarr.getSeries(params.seriesId);
		const episodes = await sonarr.getEpisodes(params.seriesId);

		// Filter to episodes in the target season that have files
		const seasonEpisodes = episodes.filter(
			(ep) =>
				ep.seasonNumber === params.seasonNumber &&
				ep.hasFile &&
				ep.episodeFileId,
		);

		// Delete all episode files for this season
		for (const episode of seasonEpisodes) {
			if (episode.episodeFileId) {
				await sonarr.deleteEpisodeFile(episode.episodeFileId);
			}
		}

		// Unmonitor the season
		const season = series.seasons.find(
			(s) => s.seasonNumber === params.seasonNumber,
		);

		if (!season) {
			throw new Error(
				`Season ${params.seasonNumber} not found in series ${params.seriesId}`,
			);
		}

		season.monitored = false;
		await sonarr.updateSeries(params.seriesId, series);

		return {
			content: [
				{
					type: "text",
					text: JSON.stringify({
						success: true,
						message:
							seasonEpisodes.length > 0
								? `Removed season ${params.seasonNumber} from series ${params.seriesId}, deleted ${seasonEpisodes.length} episode file${seasonEpisodes.length === 1 ? "" : "s"} and unmonitored the season`
								: `Unmonitored season ${params.seasonNumber} from series ${params.seriesId} (no files to delete)`,
						filesDeleted: seasonEpisodes.length,
						title: series.title,
						tvdbId: series.tvdbId,
						tmdbId: series.tmdbId,
						sonarrId: params.seriesId,
						seasonNumber: params.seasonNumber,
					}),
				},
			],
			details: undefined,
		};
	},
};

const getEpisodesParams = Type.Object({
	seriesId: Type.Number({
		description: "The ID of the series to get episodes for",
	}),
	hasFile: Type.Optional(
		Type.Boolean({
			description:
				"Whether to filter for episodes with files (ie those that have been downloaded)",
			default: false,
		}),
	),
});

export const getEpisodesTool: AgentTool<typeof getEpisodesParams> = {
	name: "get_episodes",
	description: "Get episodes for a specific TV series",
	parameters: getEpisodesParams,
	label: "Fetching episodes from Sonarr",
	async execute(_toolCallId, params) {
		const episodes = await sonarr.getEpisodes(params.seriesId);
		const hasFile = params.hasFile ?? false;
		const results = episodes
			.map(toPartialEpisode)
			.filter((episode) => episode.hasFile === hasFile);
		return {
			content: [{ type: "text", text: JSON.stringify(results) }],
			details: undefined,
		};
	},
};

export const getSeriesQueueTool: AgentTool<typeof emptyParams> = {
	name: "get_series_queue",
	description:
		"Get TV series episodes currently downloading or in the queue",
	parameters: emptyParams,
	label: "Checking Sonarr download queue",
	async execute() {
		const queueResponse = await sonarr.getQueue();
		const queueItems = queueResponse.records.map(toPartialQueueItem);

		if (queueItems.length === 0) {
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify({ message: "No downloads in progress" }),
					},
				],
				details: undefined,
			};
		}

		return {
			content: [
				{
					type: "text",
					text: JSON.stringify({
						totalRecords: queueResponse.totalRecords,
						items: queueItems,
					}),
				},
			],
			details: undefined,
		};
	},
};

const getCalendarParams = Type.Object({
	start: Type.Optional(
		Type.String({
			description: "Start date in ISO format (default: today)",
		}),
	),
	end: Type.Optional(
		Type.String({
			description: "End date in ISO format (default: 7 days from start)",
		}),
	),
	includeSeries: Type.Optional(
		Type.Boolean({
			description: "Include series information with each episode",
			default: true,
		}),
	),
});

export const getCalendarTool: AgentTool<typeof getCalendarParams> = {
	name: "get_calendar",
	description:
		"Get upcoming episodes from the calendar for a date range",
	parameters: getCalendarParams,
	label: "Checking Sonarr calendar",
	async execute(_toolCallId, params) {
		const includeSeries = params.includeSeries ?? true;
		const episodes = await sonarr.getCalendar(
			params.start,
			params.end,
			includeSeries,
		);
		return {
			content: [
				{
					type: "text",
					text: JSON.stringify(episodes.map(toPartialCalendarEpisode)),
				},
			],
			details: undefined,
		};
	},
};

const searchEpisodesParams = Type.Object({
	seriesId: Type.Optional(
		Type.Number({
			description:
				"The ID of the series to search for missing episodes",
		}),
	),
	episodeIds: Type.Optional(
		Type.Array(Type.Number(), {
			description: "Array of specific episode IDs to search for",
		}),
	),
});

export const searchEpisodesTool: AgentTool<typeof searchEpisodesParams> = {
	name: "search_episodes",
	description:
		"Search for missing episodes for a series or specific episodes",
	parameters: searchEpisodesParams,
	label: "Searching for episodes in Sonarr",
	async execute(_toolCallId, params) {
		const command = await sonarr.searchEpisodes(
			params.seriesId,
			params.episodeIds,
		);
		return {
			content: [
				{
					type: "text",
					text: JSON.stringify({
						commandId: command.id,
						status: command.status,
						message: `Search command queued for ${
							params.seriesId
								? `series ${params.seriesId}`
								: `${params.episodeIds?.length} episodes`
						}`,
					}),
				},
			],
			details: undefined,
		};
	},
};

const getSeriesHistoryParams = Type.Object({
	page: Type.Optional(
		Type.Number({
			description: "Page number for pagination",
			default: 1,
		}),
	),
	pageSize: Type.Optional(
		Type.Number({
			description: "Number of items per page",
			default: 20,
		}),
	),
	includeSeries: Type.Optional(
		Type.Boolean({
			description: "Include series information",
			default: true,
		}),
	),
	includeEpisode: Type.Optional(
		Type.Boolean({
			description: "Include episode information",
			default: true,
		}),
	),
});

export const getSeriesHistoryTool: AgentTool<typeof getSeriesHistoryParams> = {
	name: "get_series_history",
	description: "Get download and import history from Sonarr",
	parameters: getSeriesHistoryParams,
	label: "Checking Sonarr history",
	async execute(_toolCallId, params) {
		const page = params.page ?? 1;
		const pageSize = params.pageSize ?? 20;
		const includeSeries = params.includeSeries ?? true;
		const includeEpisode = params.includeEpisode ?? true;

		const historyResponse = await sonarr.getHistory(
			page,
			pageSize,
			includeSeries,
			includeEpisode,
		);

		return {
			content: [
				{
					type: "text",
					text: JSON.stringify({
						totalRecords: historyResponse.totalRecords,
						page: historyResponse.page,
						pageSize: historyResponse.pageSize,
						items: historyResponse.records.map(toPartialHistoryItem),
					}),
				},
			],
			details: undefined,
		};
	},
};
