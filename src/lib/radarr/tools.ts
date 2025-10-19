import { tool } from "ai";
import { z } from "zod";

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
		execute: async ({ radarrMovieId: movieId }) => {
			try {
				logger.info("calling getMovie tool", { movieId, context });

				slackService.sendToolCallUpdate(context, {
					status: "is checking movie details in Radarr...",
					progressMessage: "Looking up movie details...",
				});

				const movie = await radarr.getMovie(movieId);
				return toPartialMovie(movie);
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
					progressMessage: "Checking movie library...",
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
		execute: async ({ title }) => {
			try {
				logger.info("calling searchMovies tool", { title, context });

				slackService.sendToolCallUpdate(context, {
					status: `is searching for ${title} in Radarr...`,
					progressMessage: `Searching for ${title}...`,
				});

				const movies = await radarr.searchMovies(title);
				const results = movies.map(toPartialMovie);

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
		execute: async ({ tmdbId, title, year }) => {
			try {
				logger.info("calling addMovie tool", { tmdbId, context });

				slackService.sendToolCallUpdate(context, {
					status: `is adding ${title} (${year}) to Radarr...`,
					progressMessage: `Adding ${title}...`,
				});

				const result = await radarr.addMovie(title, year, tmdbId);

				const movieImage = result.images.find((i) => i.coverType === "poster");
				await slackService.sendMediaObject(context, {
					title: `${title} (${year})`,
					description: result.overview,
					image: movieImage?.remoteUrl ?? result.images?.[0]?.remoteUrl,
				});

				return {
					title: result.title,
					year: result.year,
					id: result.id,
					message: `Added "${title}" (${year}) to Radarr for monitoring and downloading. The user has been notified of the addition.`,
				};
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
		execute: async ({ movieId }) => {
			try {
				logger.info("calling removeMovie tool", { movieId, context });

				const movie = await radarr.getMovie(movieId);

				slackService.sendToolCallUpdate(context, {
					status: `is removing ${movie.title} (${movie.year}) from Radarr...`,
					progressMessage: `Removing ${movie.title}...`,
				});

				await radarr.removeMovie(movieId, true);

				return {
					success: true,
					message: `Removed ${movie.title} (${movie.year}) from Radarr and deleted files from disk.`,
				};
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

				return {
					totalRecords: queue.totalRecords,
					downloads: queue.records.map(toPartialQueueItem),
				};
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
		execute: async ({ pageSize }) => {
			logger.info("calling getHistory tool", { pageSize });

			slackService.sendToolCallUpdate(context, {
				status: "is checking the Radarr history...",
			});

			const history = await radarr.getHistory(pageSize);
			return history.records.map(toPartialHistoryRecord);
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
