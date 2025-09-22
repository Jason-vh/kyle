import { createLogger } from "@/lib/logger";
import {
	RadarrHistoryResponse,
	RadarrMovie,
	RadarrQueueResponse,
} from "@/lib/radarr/types";

const logger = createLogger("radarr/api");

/**
 * Make a request to the Radarr API.
 */
async function makeRequest(endpoint: string, options: RequestInit = {}) {
	const url = `${process.env.RADARR_HOST}/api/v3${endpoint}`;

	logger.debug("making request", { url, options });

	const response = await fetch(url, {
		...options,
		headers: {
			"X-Api-Key": process.env.RADARR_API_KEY,
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

	logger.debug("response", { response });

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
 * Fetch a single movie by ID.
 */
export async function getMovie(id: number): Promise<RadarrMovie> {
	return (await makeRequest(`/movie/${id}`)) as RadarrMovie;
}

/**
 * Fetch all movies in the library.
 */
export async function getMovies(): Promise<RadarrMovie[]> {
	return (await makeRequest("/movie")) as RadarrMovie[];
}

/**
 * Search for movies to add.
 */
export async function searchMovies(title: string): Promise<RadarrMovie[]> {
	return (await makeRequest(
		`/movie/lookup?term=${encodeURIComponent(title)}`
	)) as RadarrMovie[];
}

/**
 * Add a movie to Radarr.
 */
export async function addMovie(
	title: string,
	year: string,
	tmdbId: number
): Promise<RadarrMovie> {
	// Get quality profiles and root folders
	const qualityProfiles = (await makeRequest("/qualityprofile")) as any[];
	const rootFolders = (await makeRequest("/rootfolder")) as any[];

	if (qualityProfiles.length === 0 || rootFolders.length === 0) {
		throw new Error("No quality profiles or root folders configured");
	}

	const movieData = {
		title,
		year,
		tmdbId,
		qualityProfileId: qualityProfiles[0].id,
		rootFolderPath: rootFolders[0].path,
		path: `${rootFolders[0].path}/${title} (${year})`,
		monitored: true,
		searchForMovie: true,
		addOptions: {
			searchForMovie: true,
		},
	};

	return (await makeRequest("/movie", {
		method: "POST",
		body: JSON.stringify(movieData),
	})) as RadarrMovie;
}

/**
 * Remove a movie from Radarr.
 */
export async function removeMovie(
	movieId: number,
	deleteFiles: boolean = true
): Promise<void> {
	logger.info("removing movie", { movieId, deleteFiles });
	await makeRequest(`/movie/${movieId}?deleteFiles=${deleteFiles}`, {
		method: "DELETE",
	});
}

/**
 * Get movies in the download queue.
 */
export async function getQueue(): Promise<RadarrQueueResponse> {
	return (await makeRequest("/queue")) as RadarrQueueResponse;
}

export async function getHistory(
	pageSize: number = 20
): Promise<RadarrHistoryResponse> {
	return (await makeRequest(
		`/history?includeMovie=true&pageSize=${pageSize}`
	)) as RadarrHistoryResponse;
}
