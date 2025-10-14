import { tool } from "ai";
import { z } from "zod";

import { createLogger } from "@/lib/logger";
import * as radarr from "@/lib/radarr/api";
import * as slackService from "@/lib/slack/service";
import type { SlackContext } from "@/types";

const logger = createLogger("slack/tools");

export function getSlackTools(context: SlackContext) {
	const presentListOfMovies = tool({
		description:
			"Present a list of movies (with their names, titles, years and images) to the user. Use this tool when the user asks for a list of movies, or when you need to present a list of movies to the user.",
		inputSchema: z.object({
			movies: z.array(
				z.object({
					tmdbId: z.number(),
					title: z.string(),
					year: z.number(),
				})
			),
		}),
		execute: async ({ movies }) => {
			try {
				logger.info("calling presentListOfMovies tool", {
					context,
					movies,
				});

				const results = await Promise.all(
					movies.map(async (movie) => {
						const result = await radarr.getMovie(movie.tmdbId);
						const movieImage = result.images.find(
							(i) => i.coverType === "poster"
						);

						return {
							title: result.title,
							description: result.overview,
							image: movieImage?.remoteUrl ?? result.images?.[0]?.remoteUrl,
						};
					})
				);

				await slackService.sendMediaItems(context, results);

				logger.info("successfully presented list of movies", {
					context,
					movies,
					results,
				});

				return `List of movies presented to the user.`;
			} catch (error) {
				logger.error("Failed to present list of movies", { error, context });
				return `Failed to present list of movies: ${JSON.stringify(error)}`;
			}
		},
	});

	return {
		presentListOfMovies,
	};
}
