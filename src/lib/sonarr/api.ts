import { createLogger } from "@/lib/logger";
import {
	SonarrEpisode,
	SonarrQualityProfile,
	SonarrQueueResponse,
	SonarrRootFolder,
	SonarrSeries,
} from "@/lib/sonarr/types";

const logger = createLogger("sonarr/api");

/**
 * Make a request to the Sonarr API.
 */
async function makeRequest(
	endpoint: string,
	options: RequestInit = {}
): Promise<unknown> {
	const url = `${process.env.SONARR_HOST}/api/v3${endpoint}`;
	const response = await fetch(url, {
		...options,
		headers: {
			"X-Api-Key": process.env.SONARR_API_KEY,
			"Content-Type": "application/json",
			...options.headers,
		},
	});

	if (!response.ok) {
		throw {
			status: response.status,
			statusText: response.statusText,
			body: await response.json(),
		};
	}

	return response.json();
}

/**
 * Get a specific series by ID.
 */
export async function getSeries(seriesId: number): Promise<SonarrSeries> {
	return (await makeRequest(`/series/${seriesId}`)) as SonarrSeries;
}

/**
 * Get all series in the library.
 */
export async function getAllSeries(): Promise<SonarrSeries[]> {
	return (await makeRequest("/series")) as SonarrSeries[];
}

/**
 * Search for series to add to Sonarr.
 */
export async function searchSeries(term: string): Promise<SonarrSeries[]> {
	return (await makeRequest(
		`/series/lookup?term=${encodeURIComponent(term)}`
	)) as SonarrSeries[];
}

/**
 * Add a series to Sonarr for monitoring.
 */
export async function addSeries(
	title: string,
	year: number,
	tvdbId: number
): Promise<SonarrSeries> {
	// Get quality profiles and root folders
	const [qualityProfiles, rootFolders] = await Promise.all([
		getQualityProfiles(),
		getRootFolders(),
	]);

	if (qualityProfiles.length === 0) {
		throw new Error("No quality profiles found");
	}

	if (rootFolders.length === 0) {
		throw new Error("No root folders found");
	}

	const qualityProfile = qualityProfiles[0];
	const rootFolder = rootFolders[0];

	const seriesData = {
		title,
		year,
		tvdbId,
		qualityProfileId: qualityProfile.id,
		languageProfileId: 1, // Default language profile
		rootFolderPath: rootFolder.path,
		monitored: true,
		seasonFolder: true,
		addOptions: {
			monitor: "all",
			searchForMissingEpisodes: true,
			searchForCutoffUnmetEpisodes: false,
		},
	};

	return (await makeRequest("/series", {
		method: "POST",
		body: JSON.stringify(seriesData),
	})) as SonarrSeries;
}

/**
 * Remove a series from Sonarr.
 */
export async function removeSeries(
	seriesId: number,
	deleteFiles: boolean = false
): Promise<void> {
	await makeRequest(`/series/${seriesId}?deleteFiles=${deleteFiles}`, {
		method: "DELETE",
	});
}

/**
 * Get episodes for a series.
 */
export async function getEpisodes(seriesId: number): Promise<SonarrEpisode[]> {
	return (await makeRequest(
		`/episode?seriesId=${seriesId}`
	)) as SonarrEpisode[];
}

/**
 * Get series in the download queue.
 */
export async function getQueue(): Promise<SonarrQueueResponse> {
	return (await makeRequest(
		"/queue?includeEpisode=true&includeSeries=true"
	)) as SonarrQueueResponse;
}

/**
 * Get quality profiles.
 */
export async function getQualityProfiles(): Promise<SonarrQualityProfile[]> {
	return (await makeRequest("/qualityprofile")) as SonarrQualityProfile[];
}

/**
 * Get root folders.
 */
export async function getRootFolders(): Promise<SonarrRootFolder[]> {
	return (await makeRequest("/rootfolder")) as SonarrRootFolder[];
}
