import { tool } from "ai";
import { z } from "zod";

import { saveToolCall } from "@/lib/db/repository";
import { createLogger } from "@/lib/logger";
import * as radarr from "@/lib/radarr/api";
import {
	toPartialHistoryRecord,
	toPartialMovie,
	toPartialQueueItem,
} from "@/lib/radarr/utils";
import * as slackService from "@/lib/slack/service";
import type { SlackContext } from "@/types";

const logger = createLogger("radarr/tools");

export function getRadarrTools(context: SlackContext) {
	const getMovie = tool({
		description: "Get information about a specific movie in Radarr by ID",
		inputSchema: z.object({
			radarrMovieId: z
				.number()
				.describe("The ID of the movie to get information about."),
		}),
		execute: async (input) => {
			const { radarrMovieId: movieId } = input;
			try {
				logger.info("calling getMovie tool", { ...input, context });

				slackService.sendToolCallUpdate(context, {
					status: "is checking movie details in Radarr...",
				});

				const movie = await radarr.getMovie(movieId);
				const result = toPartialMovie(movie);

				await saveToolCall(context, "getMovie", {
					input,
					result,
					mediaRef: {
						mediaType: "movie",
						action: "query",
						ids: { radarr: result.id, tmdb: result.tmdbId },
						title: result.title,
					},
				});

				return result;
			} catch (error) {
				logger.error("Failed to get movie", { movieId, error, context });
				return `Failed to get movie with ID ${movieId}: ${JSON.stringify(
					error
				)}`;
			}
		},
	});

	const getMovies = tool({
		description: "Get all movies in the Radarr library",
		inputSchema: z.object({}),
		execute: async () => {
			try {
				logger.info("calling getMovies tool", { context });

				slackService.sendToolCallUpdate(context, {
					status: "is fetching movies from Radarr...",
				});

				const movies = await radarr.getMovies();
				return movies.map(toPartialMovie);
			} catch (error) {
				logger.error("Failed to get movies", { error, context });
				return `Failed to get movies: ${JSON.stringify(error)}`;
			}
		},
	});

	const searchMovies = tool({
		description: "Search for movies to add to Radarr using a title",
		inputSchema: z.object({
			title: z.string().describe("The title of the movie to search for"),
		}),
		execute: async (input) => {
			const { title } = input;
			try {
				logger.info("calling searchMovies tool", { ...input, context });

				slackService.sendToolCallUpdate(context, {
					status: `is searching for ${title} in Radarr...`,
				});

				const movies = await radarr.searchMovies(title);
				const results = movies.map(toPartialMovie);

				await saveToolCall(context, "searchMovies", {
					input,
					result: results,
				});

				logger.info("successfully searched for movies", {
					title,
					results,
					context,
				});
				return results;
			} catch (error) {
				logger.error("Failed to search movies", { title, error, context });
				return `Failed to search movies with title "${title}": ${JSON.stringify(
					error
				)}`;
			}
		},
	});

	const addMovie = tool({
		description:
			"Add a movie to Radarr. Requires TMDB ID, title, and year. The movie will be monitored and downloaded (if available).",
		inputSchema: z.object({
			tmdbId: z.number().describe("The TMDB ID of the movie to add"),
			title: z.string().describe("The title of the movie to add"),
			year: z.string().describe("The year of the movie to add"),
		}),
		execute: async (input) => {
			const { tmdbId, title, year } = input;
			try {
				logger.info("calling addMovie tool", { ...input, context });

				slackService.sendToolCallUpdate(context, {
					status: `is adding ${title} (${year}) to Radarr...`,
				});

				const result = await radarr.addMovie(title, year, tmdbId);

				const movieImage = result.images.find((i) => i.coverType === "poster");
				await slackService.sendMediaObject(context, {
					title: `${title} (${year})`,
					description: result.overview,
					image: movieImage?.remoteUrl ?? result.images?.[0]?.remoteUrl,
				});

				const toolResult = {
					title: result.title,
					year: result.year,
					id: result.id,
					message: `Added "${title}" (${year}) to Radarr. The user has been notified of the addition. If the movie is available, it will start downloading shortly.`,
				};

				await saveToolCall(context, "addMovie", {
					input,
					result: toolResult,
					mediaRef: {
						mediaType: "movie",
						action: "add",
						ids: { tmdb: tmdbId, radarr: result.id },
						title,
					},
				});

				return toolResult;
			} catch (error) {
				logger.error("Failed to add movie", {
					title,
					year,
					tmdbId,
					error,
					context,
				});
				return `Failed to add movie with title "${title}", year "${year}", and TMDB ID "${tmdbId}": ${JSON.stringify(
					error
				)}`;
			}
		},
	});

	const removeMovie = tool({
		description: "Remove a movie from Radarr and delete files from disk",
		inputSchema: z.object({
			movieId: z.number().describe("The ID of the movie to remove"),
		}),
		execute: async (input) => {
			const { movieId } = input;
			try {
				logger.info("calling removeMovie tool", { ...input, context });

				const movie = await radarr.getMovie(movieId);

				slackService.sendToolCallUpdate(context, {
					status: `is removing ${movie.title} (${movie.year}) from Radarr...`,
				});

				await radarr.removeMovie(movieId, true);

				const toolResult = {
					success: true,
					message: `Removed ${movie.title} (${movie.year}) from Radarr and deleted files from disk.`,
				};

				await saveToolCall(context, "removeMovie", {
					input,
					result: toolResult,
					mediaRef: {
						mediaType: "movie",
						action: "remove",
						ids: { radarr: movieId, tmdb: movie.tmdbId },
						title: movie.title,
					},
				});

				return toolResult;
			} catch (error) {
				logger.error("Failed to remove movie", { movieId, error, context });
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
				logger.info("calling getQueue tool", { context });

				slackService.sendToolCallUpdate(context, {
					status: "is checking the Radarr queue...",
				});

				const queue = await radarr.getQueue();

				const toolResult = {
					totalRecords: queue.totalRecords,
					downloads: queue.records.map(toPartialQueueItem),
				};

				await saveToolCall(context, "getQueue", {
					input: {},
					result: toolResult,
				});

				return toolResult;
			} catch (error) {
				logger.error("Failed to get queue", { error, context });
				return `Failed to get queue: ${JSON.stringify(error)}`;
			}
		},
	});

	const getHistory = tool({
		description:
			"Get the history of movies in Radarr. Each item has a type, which indicates what action was taken (grabbed, downloaded, deleted, etc.). Grabbing in this context means to start downloading it. History can be quite noisy, and there may be an unexpected number of items returned.",
		inputSchema: z.object({
			pageSize: z.number().describe("The number of items to return."),
		}),
		execute: async (input) => {
			const { pageSize } = input;
			logger.info("calling getHistory tool", { ...input, context });

			slackService.sendToolCallUpdate(context, {
				status: "is checking the Radarr history...",
			});

			const history = await radarr.getHistory(pageSize);
			const toolResult = history.records.map(toPartialHistoryRecord);

			await saveToolCall(context, "getHistory", {
				input,
				result: toolResult,
			});

			return toolResult;
		},
	});

	return {
		getMovie,
		getMovies,
		searchMovies,
		addMovie,
		removeMovie,
		getQueue,
		getHistory,
	};
}
