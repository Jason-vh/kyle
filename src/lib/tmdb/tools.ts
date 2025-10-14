import { tool } from "ai";
import { z } from "zod";

import { createLogger } from "@/lib/logger";
import * as slack from "@/lib/slack/api";
import * as slackService from "@/lib/slack/service";
import * as tmdb from "@/lib/tmdb/api";
import {
	toPartialMovie,
	toPartialMovieDetails,
	toPartialMultiResult,
	toPartialTVShow,
	toPartialTVShowDetails,
} from "@/lib/tmdb/utils";
import type { SlackContext } from "@/types";

const logger = createLogger("tmdb/tools");

export function getTMDBTools(context: SlackContext) {
	const searchMoviesOnTMDB = tool({
		description:
			"Search for movies on The Movie Database (TMDB). Use this to find movies by title, get TMDB IDs, release dates, ratings, and overviews. This is useful when users want to find a specific movie or get information about a movie before adding it to Radarr.",
		inputSchema: z.object({
			query: z.string().describe("The movie title or search query to look for"),
			year: z
				.number()
				.optional()
				.describe("Optional: Filter results by release year"),
			page: z
				.number()
				.optional()
				.describe("Optional: Page number for pagination (default: 1)"),
		}),
		execute: async ({ query, year, page }) => {
			try {
				logger.info("calling searchMovies tool", {
					query,
					year,
					page,
					context,
				});

				slackService.appendToStream(
					context,
					`I'm searching for movies on TMDB\n`
				);

				slack.setThreadStatus({
					channel_id: context.slack_channel_id,
					thread_ts: context.slack_thread_ts,
					status: `is searching for movies on TMDB...`,
				});

				const results = await tmdb.searchMovies(query, {
					year,
					page,
					include_adult: false,
				});

				return {
					page: results.page,
					total_pages: results.total_pages,
					total_results: results.total_results,
					results: results.results.map(toPartialMovie),
				};
			} catch (error) {
				logger.error("Failed to search movies", { query, error, context });
				return `Failed to search movies with query "${query}": ${JSON.stringify(
					error
				)}`;
			}
		},
	});

	const searchSeriesOnTMDB = tool({
		description:
			"Search for TV shows on The Movie Database (TMDB). Use this to find TV shows by name, get TMDB IDs, first air dates, ratings, and overviews. This is useful when users want to find a specific TV show or get information about a show before adding it to Sonarr.",
		inputSchema: z.object({
			query: z
				.string()
				.describe("The TV show name or search query to look for"),
			page: z
				.number()
				.optional()
				.describe("Optional: Page number for pagination (default: 1)"),
		}),
		execute: async ({ query, page }) => {
			try {
				logger.info("calling searchTV tool", { query, page, context });

				slack.setThreadStatus({
					channel_id: context.slack_channel_id,
					thread_ts: context.slack_thread_ts,
					status: `is searching for TV shows on TMDB...`,
				});

				slackService.appendToStream(
					context,
					`I'm searching for TV shows on TMDB\n`
				);

				const results = await tmdb.searchTV(query, {
					page,
					include_adult: false,
				});

				return {
					page: results.page,
					total_pages: results.total_pages,
					total_results: results.total_results,
					results: results.results.map(toPartialTVShow),
				};
			} catch (error) {
				logger.error("Failed to search TV shows", { query, error, context });
				return `Failed to search TV shows with query "${query}": ${JSON.stringify(
					error
				)}`;
			}
		},
	});

	const searchTMDB = tool({
		description:
			"Search for movies, TV shows, and people on The Movie Database (TMDB) in a single query. Use this when users make a general search request without specifying whether they want movies or TV shows, or when they might be looking for a person. Results include a media_type field to distinguish between 'movie', 'tv', and 'person'.",
		inputSchema: z.object({
			query: z
				.string()
				.describe("The search query to look for across all media types"),
			page: z
				.number()
				.optional()
				.describe("Optional: Page number for pagination (default: 1)"),
		}),
		execute: async ({ query, page }) => {
			try {
				logger.info("calling searchMulti tool", { query, page, context });

				slack.setThreadStatus({
					channel_id: context.slack_channel_id,
					thread_ts: context.slack_thread_ts,
					status: `is searching TMDB...`,
				});

				slackService.appendToStream(
					context,
					`I'm searching for something on TMDB\n`
				);

				const results = await tmdb.searchMulti(query, {
					page,
					include_adult: false,
				});

				return {
					page: results.page,
					total_pages: results.total_pages,
					total_results: results.total_results,
					results: results.results.map(toPartialMultiResult),
				};
			} catch (error) {
				logger.error("Failed to search TMDB", { query, error, context });
				return `Failed to search TMDB with query "${query}": ${JSON.stringify(
					error
				)}`;
			}
		},
	});

	const getMovieDetailsFromTMDB = tool({
		description:
			"Get detailed information about a specific movie from TMDB by its TMDB ID. This provides comprehensive details including runtime, budget, revenue, genres, production companies, IMDB ID, and more. Use this after you've searched for a movie and have its TMDB ID.",
		inputSchema: z.object({
			tmdbMovieId: z
				.number()
				.describe("The TMDB ID of the movie to get details for"),
		}),
		execute: async ({ tmdbMovieId }) => {
			try {
				logger.info("calling getMovieDetails tool", {
					tmdbMovieId,
					context,
				});

				slackService.appendToStream(
					context,
					`I'm looking up a movie in TMDB\n`
				);

				slack.setThreadStatus({
					channel_id: context.slack_channel_id,
					thread_ts: context.slack_thread_ts,
					status: `is fetching movie details from TMDB...`,
				});

				const movie = await tmdb.getMovie(tmdbMovieId);
				return toPartialMovieDetails(movie);
			} catch (error) {
				logger.error("Failed to get movie details", {
					tmdbMovieId,
					error,
					context,
				});
				return `Failed to get movie details for TMDB ID ${tmdbMovieId}: ${JSON.stringify(
					error
				)}`;
			}
		},
	});

	const getSeriesDetailsFromTMDB = tool({
		description:
			"Get detailed information about a specific TV show from TMDB by its TMDB ID. This provides comprehensive details including number of seasons, episodes, networks, creators, episode runtime, genres, and season information. Use this after you've searched for a TV show and have its TMDB ID.",
		inputSchema: z.object({
			tmdbTVId: z
				.number()
				.describe("The TMDB ID of the TV show to get details for"),
		}),
		execute: async ({ tmdbTVId }) => {
			try {
				logger.info("calling getTVShowDetails tool", { tmdbTVId, context });

				slack.setThreadStatus({
					channel_id: context.slack_channel_id,
					thread_ts: context.slack_thread_ts,
					status: `is fetching TV show details from TMDB...`,
				});

				slackService.appendToStream(
					context,
					`I'm looking up a series in TMDB\n`
				);

				const show = await tmdb.getTVShow(tmdbTVId);
				return toPartialTVShowDetails(show);
			} catch (error) {
				logger.error("Failed to get TV show details", {
					tmdbTVId,
					error,
					context,
				});
				return `Failed to get TV show details for TMDB ID ${tmdbTVId}: ${JSON.stringify(
					error
				)}`;
			}
		},
	});

	return {
		searchMoviesOnTMDB,
		searchSeriesOnTMDB,
		searchTMDB,
		getMovieDetailsFromTMDB,
		getSeriesDetailsFromTMDB,
	};
}
