import { createLogger } from "@/lib/logger";
import type {
	TMDBMovie,
	TMDBMovieDetails,
	TMDBMultiResult,
	TMDBSearchOptions,
	TMDBSearchResponse,
	TMDBTVShow,
	TMDBTVShowDetails,
} from "@/lib/tmdb/types";

const logger = createLogger("tmdb/api");

const TMDB_BASE_URL = "https://api.themoviedb.org/3";

/**
 * Make a request to the TMDB API.
 */
async function makeRequest(endpoint: string, options: RequestInit = {}) {
	if (!Bun.env.TMDB_API_TOKEN) {
		throw new Error("TMDB_API_TOKEN is not set");
	}

	const url = `${TMDB_BASE_URL}${endpoint}`;

	const response = await fetch(url, {
		...options,
		headers: {
			Authorization: `Bearer ${Bun.env.TMDB_API_TOKEN}`,
			"Content-Type": "application/json",
			...options.headers,
		},
	});

	const text = await response.text();
	let json: unknown;
	try {
		json = JSON.parse(text);
	} catch (error) {
		json = text;
	}

	if (!response.ok) {
		throw {
			response,
			status: response.status,
			statusText: response.statusText,
			body: json,
		};
	}

	try {
		return json;
	} catch (error) {
		return undefined;
	}
}

/**
 * Build query string from search options
 */
function buildQueryString(query: string, options?: TMDBSearchOptions): string {
	const params = new URLSearchParams({
		query,
	});

	if (options?.language) {
		params.append("language", options.language);
	}

	if (options?.page) {
		params.append("page", options.page.toString());
	}

	if (options?.include_adult !== undefined) {
		params.append("include_adult", options.include_adult.toString());
	}

	if (options?.region) {
		params.append("region", options.region);
	}

	if (options?.year) {
		params.append("year", options.year.toString());
	}

	if (options?.primary_release_year) {
		params.append(
			"primary_release_year",
			options.primary_release_year.toString()
		);
	}

	return params.toString();
}

/**
 * Search for movies on TMDB
 */
export async function searchMovies(
	query: string,
	options?: TMDBSearchOptions
): Promise<TMDBSearchResponse<TMDBMovie>> {
	const queryString = buildQueryString(query, options);
	return (await makeRequest(
		`/search/movie?${queryString}`
	)) as TMDBSearchResponse<TMDBMovie>;
}

/**
 * Search for TV shows on TMDB
 */
export async function searchTV(
	query: string,
	options?: TMDBSearchOptions
): Promise<TMDBSearchResponse<TMDBTVShow>> {
	const queryString = buildQueryString(query, options);
	return (await makeRequest(
		`/search/tv?${queryString}`
	)) as TMDBSearchResponse<TMDBTVShow>;
}

/**
 * Search for movies, TV shows, and people on TMDB
 */
export async function searchMulti(
	query: string,
	options?: TMDBSearchOptions
): Promise<TMDBSearchResponse<TMDBMultiResult>> {
	const queryString = buildQueryString(query, options);
	return (await makeRequest(
		`/search/multi?${queryString}`
	)) as TMDBSearchResponse<TMDBMultiResult>;
}

/**
 * Get detailed information about a specific movie by TMDB ID
 */
export async function getMovie(movieId: number): Promise<TMDBMovieDetails> {
	return (await makeRequest(`/movie/${movieId}`)) as TMDBMovieDetails;
}

/**
 * Get detailed information about a specific TV show by TMDB ID
 */
export async function getTVShow(tvId: number): Promise<TMDBTVShowDetails> {
	return (await makeRequest(`/tv/${tvId}`)) as TMDBTVShowDetails;
}
