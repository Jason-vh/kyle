import { tool } from "ai";
import { z } from "zod";

import { createLogger } from "@/lib/logger";
import * as radarrApi from "./api";
import {
	toPartialHistoryRecord,
	toPartialMovie,
	toPartialQueueItem,
} from "./utils";

const logger = createLogger("radarr/tools");

const getMovie = tool({
	description: "Get information about a specific movie in Radarr by ID",
	inputSchema: z.object({
		movieId: z
			.number()
			.describe("The ID of the movie to get information about"),
	}),
	execute: async ({ movieId }) => {
		try {
			logger.log("calling getMovie tool", { movieId });
			const movie = await radarrApi.getMovie(movieId);
			return toPartialMovie(movie);
		} catch (error) {
			logger.error("Failed to get movie", { movieId, error });
			return `Failed to get movie with ID ${movieId}: ${JSON.stringify(error)}`;
		}
	},
});

const getMovies = tool({
	description: "Get all movies in the Radarr library",
	inputSchema: z.object({}),
	execute: async () => {
		try {
			logger.log("calling getMovies tool");
			const movies = await radarrApi.getMovies();
			return movies.map(toPartialMovie);
		} catch (error) {
			logger.error("Failed to get movies", { error });
			return `Failed to get movies: ${JSON.stringify(error)}`;
		}
	},
});

const searchMovies = tool({
	description: "Search for movies to add to Radarr using a title",
	inputSchema: z.object({
		title: z.string().describe("The title of the movie to search for"),
	}),
	execute: async ({ title }) => {
		try {
			logger.log("calling searchMovies tool", { title });
			const movies = await radarrApi.searchMovies(title);
			return movies.map(toPartialMovie);
		} catch (error) {
			logger.error("Failed to search movies", { title, error });
			return `Failed to search movies with title "${title}": ${JSON.stringify(
				error
			)}`;
		}
	},
});

const addMovie = tool({
	description:
		"Add a movie to Radarr for monitoring and downloading. Requires title, year, and TMDB ID.",
	inputSchema: z.object({
		title: z.string().describe("The title of the movie to add"),
		year: z.string().describe("The year of the movie to add"),
		tmdbId: z.number().describe("The TMDB ID of the movie to add"),
	}),
	execute: async ({ title, year, tmdbId }) => {
		try {
			logger.log("calling addMovie tool", { title, year, tmdbId });
			const result = await radarrApi.addMovie(title, year, tmdbId);
			return {
				title: result.title,
				year: result.year,
				id: result.id,
				message: `Added "${title}" (${year}) to Radarr for monitoring and downloading`,
			};
		} catch (error) {
			logger.error("Failed to add movie", { title, year, tmdbId, error });
			return `Failed to add movie with title "${title}", year "${year}", and TMDB ID "${tmdbId}": ${JSON.stringify(
				error
			)}`;
		}
	},
});

const removeMovie = tool({
	description:
		"Remove a movie from Radarr and optionally delete files from disk",
	inputSchema: z.object({
		movieId: z.number().describe("The ID of the movie to remove"),
	}),
	execute: async ({ movieId }) => {
		try {
			logger.log("calling removeMovie tool", { movieId });
			await radarrApi.removeMovie(movieId, true);
			return {
				success: true,
				message: `Removed movie with ID ${movieId} and deleted files from disk`,
			};
		} catch (error) {
			logger.error("Failed to remove movie", { movieId, error });
			return `Failed to remove movie with ID ${movieId}: ${JSON.stringify(
				error
			)}`;
		}
	},
});

const getQueue = tool({
	description: "Get movies currently downloading or in the queue",
	inputSchema: z.object({}),
	execute: async () => {
		try {
			logger.log("calling getQueue tool");
			const queue = await radarrApi.getQueue();

			return {
				totalRecords: queue.totalRecords,
				downloads: queue.records.map(toPartialQueueItem),
			};
		} catch (error) {
			logger.error("Failed to get queue", { error });
			return `Failed to get queue: ${JSON.stringify(error)}`;
		}
	},
});

const getHistory = tool({
	description:
		"Get the history of movies in Radarr. Each item has a type, which indicates what action was taken (grabbed, downloaded, deleted, etc.). Grabbing in this context means to start downloading it.",
	inputSchema: z.object({
		pageSize: z
			.number()
			.describe(
				"The number of items to return. Use a larger number than you think, because history can be quite granular and noisy."
			),
	}),
	execute: async ({ pageSize }) => {
		logger.log("calling getHistory tool", { pageSize });
		const history = await radarrApi.getHistory(pageSize);
		return history.records.map(toPartialHistoryRecord);
	},
});

export const radarrTools = {
	getMovie,
	getMovies,
	searchMovies,
	addMovie,
	removeMovie,
	getQueue,
	getHistory,
};
