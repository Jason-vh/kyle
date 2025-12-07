import { createLogger } from "@/lib/logger";
import * as api from "./api";
import type { RadarrMovie } from "./types";

const logger = createLogger("radarr/service");

/**
 * Add a movie to Radarr using its TMDB ID.
 * Fetches canonical metadata from TMDB to ensure correct title/year.
 */
export async function addMovieByTmdbId(tmdbId: number): Promise<RadarrMovie> {
	// Fetch canonical movie metadata from TMDB via Radarr
	const movieLookup = await api.lookupMovieByTmdbId(tmdbId);

	logger.info("adding movie with canonical metadata", {
		tmdbId,
		title: movieLookup.title,
		year: movieLookup.year,
	});

	return api.addMovie(movieLookup.title, movieLookup.year, tmdbId);
}
