import { tool } from "ai";
import { z } from "zod";

import { createLogger } from "@/lib/logger";
import * as sonarrApi from "@/lib/sonarr/api";
import {
	toPartialEpisode,
	toPartialQueueItem,
	toPartialSeries,
} from "@/lib/sonarr/utils";

const logger = createLogger("sonarr/tools");

const getSeries = tool({
	description: "Get information about a specific TV series in Sonarr by ID",
	inputSchema: z.object({
		seriesId: z
			.number()
			.describe("The ID of the series to get information about"),
	}),
	execute: async ({ seriesId }) => {
		logger.info("calling getSeries tool", { seriesId });
		try {
			const series = await sonarrApi.getSeries(seriesId);
			const result = toPartialSeries(series);
			logger.info("successfully retrieved series", {
				seriesId,
				title: result.title,
			});
			return result;
		} catch (error) {
			logger.error("Failed to get series", { error });
			return `Failed to get series: ${JSON.stringify(error)}`;
		}
	},
});

const getAllSeries = tool({
	description: "Get all TV series in the Sonarr library",
	inputSchema: z.object({}),
	execute: async () => {
		logger.info("calling getAllSeries tool");
		try {
			const series = await sonarrApi.getAllSeries();
			const results = series.map(toPartialSeries);
			logger.info("successfully retrieved all series", {
				results,
			});
			return results;
		} catch (error) {
			logger.error("Failed to get all series", { error });
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
		logger.info("calling searchSeries tool", { title });
		try {
			const series = await sonarrApi.searchSeries(title);
			const results = series.map(toPartialSeries).filter((s) => !!s.id); // some series don't have an ID
			logger.info("successfully searched for series", {
				title,
				results,
			});
			return results;
		} catch (error) {
			logger.error("Failed to search series", { title, error });
			return `Failed to search series with title "${title}": ${JSON.stringify(
				error
			)}`;
		}
	},
});

const addSeries = tool({
	description:
		"Add a TV series to Sonarr for monitoring and downloading. Requires title, year, and TVDB ID.",
	inputSchema: z.object({
		title: z.string().describe("The title of the series to add"),
		year: z.number().describe("The year the series started"),
		tvdbId: z.number().describe("The TVDB ID of the series to add"),
	}),
	execute: async ({ title, year, tvdbId }) => {
		logger.info("calling addSeries tool", { title, year, tvdbId });
		try {
			const series = await sonarrApi.addSeries(title, year, tvdbId);
			const result = toPartialSeries(series);
			const response = {
				series: result,
				message: `Added "${title}" (${year}) to Sonarr for monitoring and downloading`,
			};
			logger.info("successfully added series", response);
			return response;
		} catch (error) {
			logger.error("Failed to add series", {
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
		"Remove a TV series from Sonarr and optionally delete files from disk",
	inputSchema: z.object({
		seriesId: z.number().describe("The ID of the series to remove"),
		deleteFiles: z
			.boolean()
			.optional()
			.describe("Whether to delete files from disk (default: false)"),
	}),
	execute: async ({ seriesId, deleteFiles = false }) => {
		logger.info("calling removeSeries tool", { seriesId, deleteFiles });
		try {
			await sonarrApi.removeSeries(seriesId, deleteFiles);
			const response = {
				success: true,
				message: `Removed series with ID ${seriesId}${
					deleteFiles ? " and deleted files from disk" : ""
				}`,
			};
			logger.info("successfully removed series", { seriesId, deleteFiles });
			return response;
		} catch (error) {
			logger.error("Failed to remove series", {
				seriesId,
				deleteFiles,
				error,
			});
			return `Failed to remove series with ID ${seriesId}${
				deleteFiles ? " and deleted files from disk" : ""
			}: ${JSON.stringify(error)}`;
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
		logger.info("calling getEpisodes tool", { seriesId, hasFile });
		try {
			const episodes = await sonarrApi.getEpisodes(seriesId);
			const results = episodes
				.map(toPartialEpisode)
				.filter((episode) => episode.hasFile === hasFile);

			logger.info("successfully retrieved episodes", {
				seriesId,
				results,
			});
			return results;
		} catch (error) {
			logger.error("Failed to get episodes", { seriesId, error });
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
		logger.info("calling getQueue tool");
		try {
			const queueResponse = await sonarrApi.getQueue();
			const queueItems = queueResponse.records.map(toPartialQueueItem);

			if (queueItems.length === 0) {
				logger.info("no downloads in progress");
				return { message: "No downloads in progress" };
			}

			const response = {
				totalRecords: queueResponse.totalRecords,
				items: queueItems,
			};

			logger.info("retrieved download queue", response);
			return response;
		} catch (error) {
			logger.error("Failed to get queue", { error });
			return `Failed to get queue: ${JSON.stringify(error)}`;
		}
	},
});

export const sonarrTools = {
	getSeries,
	getAllSeries,
	searchSeries,
	addSeries,
	removeSeries,
	getEpisodes,
	getQueue,
};
