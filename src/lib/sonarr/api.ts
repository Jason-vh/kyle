import { createLogger } from "@/lib/logger";
import type {
	SonarrCalendarEpisode,
	SonarrCommand,
	SonarrEpisode,
	SonarrHistoryResponse,
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
	const url = `${Bun.env.SONARR_HOST}/api/v3${endpoint}`;

	if (!Bun.env.SONARR_API_KEY) {
		throw new Error("SONARR_API_KEY is not set");
	}

	if (!Bun.env.SONARR_HOST) {
		throw new Error("SONARR_HOST is not set");
	}

	const response = await fetch(url, {
		...options,
		headers: {
			"X-Api-Key": Bun.env.SONARR_API_KEY,
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
	const results = await makeRequest(`/series/${seriesId}`);

	return results as SonarrSeries;
}

/**
 * Get all series in the library.
 */
export async function getAllSeries(): Promise<SonarrSeries[]> {
	const results = await makeRequest("/series");

	return results as SonarrSeries[];
}

/**
 * Search for series to add to Sonarr.
 */
export async function searchSeries(term: string): Promise<SonarrSeries[]> {
	const results = await makeRequest(
		`/series/lookup?term=${encodeURIComponent(term)}`
	);

	return results as SonarrSeries[];
}

export type MonitorOption =
	| "all"
	| "future"
	| "missing"
	| "existing"
	| "lastSeason"
	| "none";

/**
 * Add a series to Sonarr for monitoring.
 */
export async function addSeries(
	title: string,
	year: number,
	tvdbId: number,
	monitorOption: MonitorOption
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

	const qualityProfile = qualityProfiles[0]!;
	const rootFolder = rootFolders[0]!;

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
			monitor: monitorOption,
			searchForMissingEpisodes: true,
			searchForCutoffUnmetEpisodes: false,
		},
	};

	const results = await makeRequest("/series", {
		method: "POST",
		body: JSON.stringify(seriesData),
	});

	return results as SonarrSeries;
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
 * Delete an episode file from disk.
 */
export async function deleteEpisodeFile(episodeFileId: number): Promise<void> {
	await makeRequest(`/episodefile/${episodeFileId}`, {
		method: "DELETE",
	});
}

/**
 * Update a series in Sonarr (e.g., to change monitoring settings).
 */
export async function updateSeries(
	seriesId: number,
	seriesData: SonarrSeries
): Promise<SonarrSeries> {
	const results = await makeRequest(`/series/${seriesId}`, {
		method: "PUT",
		body: JSON.stringify(seriesData),
	});

	return results as SonarrSeries;
}

/**
 * Get episodes for a series.
 */
export async function getEpisodes(seriesId: number): Promise<SonarrEpisode[]> {
	const results = await makeRequest(`/episode?seriesId=${seriesId}`);

	return results as SonarrEpisode[];
}

/**
 * Get series in the download queue.
 */
export async function getQueue(): Promise<SonarrQueueResponse> {
	const results = await makeRequest(
		"/queue?includeEpisode=true&includeSeries=true"
	);

	return results as SonarrQueueResponse;
}

/**
 * Get quality profiles.
 */
export async function getQualityProfiles(): Promise<SonarrQualityProfile[]> {
	const results = await makeRequest("/qualityprofile");

	return results as SonarrQualityProfile[];
}

/**
 * Get root folders.
 */
export async function getRootFolders(): Promise<SonarrRootFolder[]> {
	const results = await makeRequest("/rootfolder");

	return results as SonarrRootFolder[];
}

/**
 * Get calendar episodes for a date range.
 */
export async function getCalendar(
	start?: string,
	end?: string,
	includeSeries: boolean = true
): Promise<SonarrCalendarEpisode[]> {
	const params = new URLSearchParams();
	if (start) params.append("start", start);
	if (end) params.append("end", end);
	params.append("includeSeries", includeSeries.toString());

	const endpoint = `/calendar${
		params.toString() ? `?${params.toString()}` : ""
	}`;
	const results = await makeRequest(endpoint);

	return results as SonarrCalendarEpisode[];
}

/**
 * Search for episodes (missing episodes for a series or specific episodes).
 */
export async function searchEpisodes(
	seriesId?: number,
	episodeIds?: number[]
): Promise<SonarrCommand> {
	const commandBody: Record<string, unknown> = {};

	if (seriesId && !episodeIds) {
		commandBody.name = "SeriesSearch";
		commandBody.seriesId = seriesId;
	} else if (episodeIds && episodeIds.length > 0) {
		commandBody.name = "EpisodeSearch";
		commandBody.episodeIds = episodeIds;
	} else {
		throw new Error("Must provide either seriesId or episodeIds");
	}

	const results = await makeRequest("/command", {
		method: "POST",
		body: JSON.stringify(commandBody),
	});

	return results as SonarrCommand;
}

/**
 * Get download/import history.
 */
export async function getHistory(
	page: number = 1,
	pageSize: number = 20,
	includeSeries: boolean = true,
	includeEpisode: boolean = true
): Promise<SonarrHistoryResponse> {
	const params = new URLSearchParams({
		page: page.toString(),
		pageSize: pageSize.toString(),
		includeSeries: includeSeries.toString(),
		includeEpisode: includeEpisode.toString(),
	});

	const results = await makeRequest(`/history?${params.toString()}`);

	return results as SonarrHistoryResponse;
}

/**
 * Get episodes that haven't met quality cutoff (missing/wanted episodes).
 */
export async function getWantedMissing(
	page: number = 1,
	pageSize: number = 20,
	includeSeries: boolean = true,
	includeEpisode: boolean = true
): Promise<SonarrQueueResponse> {
	const params = new URLSearchParams({
		page: page.toString(),
		pageSize: pageSize.toString(),
		includeSeries: includeSeries.toString(),
		includeEpisode: includeEpisode.toString(),
	});

	const results = await makeRequest(`/wanted/cutoff?${params.toString()}`);

	return results as SonarrQueueResponse;
}
