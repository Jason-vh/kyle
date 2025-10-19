import { tool } from "ai";
import { z } from "zod";

import { createLogger } from "@/lib/logger";
import * as slackService from "@/lib/slack/service";
import * as sonarr from "@/lib/sonarr/api";
import {
	toPartialCalendarEpisode,
	toPartialEpisode,
	toPartialHistoryItem,
	toPartialQueueItem,
	toPartialSeries,
} from "@/lib/sonarr/utils";
import type { SlackContext } from "@/types";

const logger = createLogger("sonarr/tools");

export function getSonarrTools(context: SlackContext) {
	const getSeriesBySonarrId = tool({
		description: "Get information about a specific TV series in Sonarr by ID",
		inputSchema: z.object({
			seriesId: z
				.number()
				.describe("The ID of the series to get information about"),
		}),
		execute: async ({ seriesId }) => {
			logger.info("calling getSeries tool", { seriesId, context });
			try {
				slackService.sendToolCallUpdate(context, {
					status: "is checking series details in Sonarr...",
					progressMessage: "Looking up series...",
				});

				const series = await sonarr.getSeries(seriesId);
				const result = toPartialSeries(series);

				logger.info("successfully retrieved series", {
					seriesId,
					title: result.title,
					context,
				});
				return result;
			} catch (error) {
				logger.error("Failed to get series", { error, context });
				return `Failed to get series: ${JSON.stringify(error)}`;
			}
		},
	});

	const getAllSeries = tool({
		description: "Get all TV series in the Sonarr library",
		inputSchema: z.object({}),
		execute: async () => {
			logger.info("calling getAllSeries tool", { context });
			try {
				slackService.sendToolCallUpdate(context, {
					status: "is fetching all series in Sonarr...",
					progressMessage: "Looking up series...",
				});

				const series = await sonarr.getAllSeries();
				const results = series.map(toPartialSeries);
				logger.info("successfully retrieved all series", {
					results,
					context,
				});
				return results;
			} catch (error) {
				logger.error("Failed to get all series", { error, context });
				return `Failed to get all series: ${JSON.stringify(error)}`;
			}
		},
	});

	const searchSeries = tool({
		description: "Search for TV series to add to Sonarr using a title",
		inputSchema: z.object({
			title: z.string().describe("The title of the TV series to search for"),
		}),
		execute: async ({ title }) => {
			logger.info("calling searchSeries tool", { title, context });
			try {
				slackService.sendToolCallUpdate(context, {
					status: `is searching for ${title} in Sonarr...`,
					progressMessage: `Searching for ${title}...`,
				});

				const series = await sonarr.searchSeries(title);
				const results = series.map(toPartialSeries);

				logger.info("successfully searched for series", {
					title,
					results,
				});
				return results;
			} catch (error) {
				logger.error("Failed to search series", { title, error, context });
				return `Failed to search series with title "${title}": ${JSON.stringify(
					error
				)}`;
			}
		},
	});

	const addSeries = tool({
		description:
			"Add a TV series to Sonarr for. Requires title, year, and TVDB ID. After being added, the series will start downloading (if available).",
		inputSchema: z.object({
			title: z.string().describe("The title of the series to add"),
			year: z.number().describe("The year the series started"),
			tvdbId: z.number().describe("The TVDB ID of the series to add"),
		}),
		execute: async ({ title, year, tvdbId }) => {
			logger.info("calling addSeries tool", { title, year, tvdbId, context });
			try {
				slackService.sendToolCallUpdate(context, {
					status: `is adding ${title} (${year}) to Sonarr...`,
					progressMessage: `Adding ${title} (${year})...`,
				});

				const series = await sonarr.addSeries(title, year, tvdbId);

				const seriesImage = series.images.find((i) => i.coverType === "poster");

				await slackService.sendMediaObject(context, {
					title: `${series.title} (${series.year})`,
					description: series.overview,
					image: seriesImage?.remoteUrl ?? series.images?.[0]?.remoteUrl,
				});

				const result = toPartialSeries(series);

				const response = {
					series: result,
					message: `Added "${title}" (${year}) to Sonarr for. The user has been notified of the addition.`,
				};
				logger.info("successfully added series", { response, context });
				return response;
			} catch (error) {
				logger.error("Failed to add series", {
					context,
					title,
					year,
					tvdbId,
					error,
				});

				return `Failed to add series with title "${title}", year "${year}", and TVDB ID "${tvdbId}": ${JSON.stringify(
					error
				)}`;
			}
		},
	});

	const removeSeries = tool({
		description:
			"Remove a TV series from Sonarr and delete the files from disk",
		inputSchema: z.object({
			seriesId: z.number().describe("The ID of the series to remove"),
		}),
		execute: async ({ seriesId }) => {
			logger.info("calling removeSeries tool", {
				seriesId,
				context,
			});
			try {
				const series = await sonarr.getSeries(seriesId);

				slackService.sendToolCallUpdate(context, {
					status: `is removing ${series.title} (${series.year}) from Sonarr...`,
					progressMessage: `Removing ${series.title} (${series.year})...`,
				});

				await sonarr.removeSeries(seriesId, true);

				const response = {
					success: true,
					message: `Removed *${series.title}* (${series.year}) from Sonarr and deleted files from disk.`,
				};
				logger.info("successfully removed series", {
					seriesId,
					context,
				});
				return response;
			} catch (error) {
				logger.error("Failed to remove series", {
					context,
					seriesId,
					error,
				});
				return `Failed to remove series with ID ${seriesId}: ${JSON.stringify(
					error
				)}`;
			}
		},
	});

	const removeSeason = tool({
		description:
			"Remove a specific season from a TV series in Sonarr and delete all episode files from disk",
		inputSchema: z.object({
			seriesId: z.number().describe("The ID of the series"),
			seasonNumber: z
				.number()
				.describe(
					"The season number to remove (e.g., 1 for Season 1, 0 for Specials)"
				),
		}),
		execute: async ({ seriesId, seasonNumber }) => {
			logger.info("calling removeSeason tool", {
				seriesId,
				seasonNumber,
				context,
			});
			try {
				const series = await sonarr.getSeries(seriesId);

				slackService.sendToolCallUpdate(context, {
					status: `is removing season ${seasonNumber} of ${series.title} (${series.year})...`,
					progressMessage: `Removing season ${seasonNumber} of ${series.title} (${series.year})...`,
				});

				// Get all episodes for the series
				const episodes = await sonarr.getEpisodes(seriesId);

				// Filter to episodes in the target season that have files
				const seasonEpisodes = episodes.filter(
					(ep) =>
						ep.seasonNumber === seasonNumber && ep.hasFile && ep.episodeFileId
				);

				// Delete all episode files for this season
				for (const episode of seasonEpisodes) {
					if (episode.episodeFileId) {
						await sonarr.deleteEpisodeFile(episode.episodeFileId);
					}
				}

				// Get the series and unmonitor the season
				const season = series.seasons.find(
					(s) => s.seasonNumber === seasonNumber
				);

				if (!season) {
					throw new Error(
						`Season ${seasonNumber} not found in series ${seriesId}`
					);
				}

				season.monitored = false;
				await sonarr.updateSeries(seriesId, series);

				const response = {
					success: true,
					message:
						seasonEpisodes.length > 0
							? `Removed season ${seasonNumber} from series ${seriesId}, deleted ${
									seasonEpisodes.length
							  } episode file${
									seasonEpisodes.length === 1 ? "" : "s"
							  } and unmonitored the season`
							: `Unmonitored season ${seasonNumber} from series ${seriesId} (no files to delete)`,
					filesDeleted: seasonEpisodes.length,
				};

				logger.info("successfully removed season", {
					seriesId,
					seasonNumber,
					filesDeleted: seasonEpisodes.length,
					context,
				});
				return response;
			} catch (error) {
				logger.error("Failed to remove season", {
					seriesId,
					seasonNumber,
					error,
					context,
				});
				return `Failed to remove season ${seasonNumber} from series ${seriesId}: ${JSON.stringify(
					error
				)}`;
			}
		},
	});

	const getEpisodes = tool({
		description: "Get episodes for a specific TV series",
		inputSchema: z.object({
			seriesId: z.number().describe("The ID of the series to get episodes for"),
			hasFile: z
				.boolean()
				.optional()
				.describe(
					"Whether to filter for episodes with files (ie those that have been downloaded)"
				)
				.default(false),
		}),
		execute: async ({ seriesId, hasFile = false }) => {
			logger.info("calling getEpisodes tool", { seriesId, hasFile, context });
			try {
				slackService.sendToolCallUpdate(context, {
					status: `is checking episodes for series ${seriesId} in Sonarr...`,
				});

				const episodes = await sonarr.getEpisodes(seriesId);
				const results = episodes
					.map(toPartialEpisode)
					.filter((episode) => episode.hasFile === hasFile);

				logger.info("successfully retrieved episodes", {
					seriesId,
					results,
				});
				return results;
			} catch (error) {
				logger.error("Failed to get episodes", { seriesId, error, context });
				return `Failed to get episodes for series with ID ${seriesId}: ${JSON.stringify(
					error
				)}`;
			}
		},
	});

	const getQueue = tool({
		description: "Get TV series episodes currently downloading or in the queue",
		inputSchema: z.object({}),
		execute: async () => {
			logger.info("calling getQueue tool", { context });
			try {
				slackService.sendToolCallUpdate(context, {
					status: `is checking the Sonarr queue...`,
				});

				const queueResponse = await sonarr.getQueue();
				const queueItems = queueResponse.records.map(toPartialQueueItem);

				if (queueItems.length === 0) {
					logger.info("no downloads in progress");
					return { message: "No downloads in progress" };
				}

				const response = {
					totalRecords: queueResponse.totalRecords,
					items: queueItems,
				};

				logger.info("retrieved download queue", { response, context });
				return response;
			} catch (error) {
				logger.error("Failed to get queue", { error, context });
				return `Failed to get queue: ${JSON.stringify(error)}`;
			}
		},
	});

	const getCalendar = tool({
		description: "Get upcoming episodes from the calendar for a date range",
		inputSchema: z.object({
			start: z
				.string()
				.optional()
				.describe("Start date in ISO format (default: today)"),
			end: z
				.string()
				.optional()
				.describe("End date in ISO format (default: 7 days from start)"),
			includeSeries: z
				.boolean()
				.optional()
				.default(true)
				.describe("Include series information with each episode"),
		}),
		execute: async ({ start, end, includeSeries = true }) => {
			logger.info("calling getCalendar tool", {
				start,
				end,
				includeSeries,
				context,
			});
			try {
				slackService.sendToolCallUpdate(context, {
					status: `is checking the Sonarr calendar...`,
				});

				const episodes = await sonarr.getCalendar(start, end, includeSeries);
				const results = episodes.map(toPartialCalendarEpisode);
				logger.info("successfully retrieved calendar episodes", {
					count: results.length,
					context,
				});
				return results;
			} catch (error) {
				logger.error("Failed to get calendar", { error, context });
				return `Failed to get calendar: ${JSON.stringify(error)}`;
			}
		},
	});

	const searchEpisodes = tool({
		description:
			"Search for missing episodes for a series or specific episodes",
		inputSchema: z.object({
			seriesId: z
				.number()
				.optional()
				.describe("The ID of the series to search for missing episodes"),
			episodeIds: z
				.array(z.number())
				.optional()
				.describe("Array of specific episode IDs to search for"),
		}),
		execute: async ({ seriesId, episodeIds }) => {
			logger.info("calling searchEpisodes tool", {
				seriesId,
				episodeIds,
				context,
			});
			try {
				slackService.sendToolCallUpdate(context, {
					status: `is searching for episodes in Sonarr...`,
					progressMessage: `Starting search for episodes in Sonarr...`,
				});

				const command = await sonarr.searchEpisodes(seriesId, episodeIds);
				const response = {
					commandId: command.id,
					status: command.status,
					message: `Search command queued for ${
						seriesId ? `series ${seriesId}` : `${episodeIds?.length} episodes`
					}`,
				};
				logger.info("successfully queued episode search", {
					command: response,
					context,
				});
				return response;
			} catch (error) {
				logger.error("Failed to search episodes", {
					seriesId,
					episodeIds,
					error,
					context,
				});
				return `Failed to search episodes: ${JSON.stringify(error)}`;
			}
		},
	});

	const getHistory = tool({
		description: "Get download and import history from Sonarr",
		inputSchema: z.object({
			page: z
				.number()
				.optional()
				.default(1)
				.describe("Page number for pagination"),
			pageSize: z
				.number()
				.optional()
				.default(20)
				.describe("Number of items per page"),
			includeSeries: z
				.boolean()
				.optional()
				.default(true)
				.describe("Include series information"),
			includeEpisode: z
				.boolean()
				.optional()
				.default(true)
				.describe("Include episode information"),
		}),
		execute: async ({
			page = 1,
			pageSize = 20,
			includeSeries = true,
			includeEpisode = true,
		}) => {
			logger.info("calling getHistory tool", {
				page,
				pageSize,
				includeSeries,
				includeEpisode,
				context,
			});
			try {
				slackService.sendToolCallUpdate(context, {
					status: `is checking Sonarr history...`,
				});

				const historyResponse = await sonarr.getHistory(
					page,
					pageSize,
					includeSeries,
					includeEpisode
				);
				const results = historyResponse.records.map(toPartialHistoryItem);
				const response = {
					totalRecords: historyResponse.totalRecords,
					page: historyResponse.page,
					pageSize: historyResponse.pageSize,
					items: results,
				};
				logger.info("successfully retrieved history", {
					totalRecords: response.totalRecords,
					itemCount: results.length,
					context,
				});
				return response;
			} catch (error) {
				logger.error("Failed to get history", { error, context });
				return `Failed to get history: ${JSON.stringify(error)}`;
			}
		},
	});

	return {
		getSeriesBySonarrId,
		getAllSeries,
		searchSeries,
		addSeries,
		removeSeries,
		removeSeason,
		getEpisodes,
		getQueue,
		getCalendar,
		searchEpisodes,
		getHistory,
	};
}
