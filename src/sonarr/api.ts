import type {
	SonarrCalendarEpisode,
	SonarrCommand,
	SonarrEpisode,
	SonarrHistoryResponse,
	SonarrQualityProfile,
	SonarrQueueResponse,
	SonarrRootFolder,
	SonarrSeries,
} from "./types.ts";

const SONARR_HOST = process.env.SONARR_HOST;
const SONARR_API_KEY = process.env.SONARR_API_KEY;

async function makeRequest(
	endpoint: string,
	options: RequestInit = {},
): Promise<unknown> {
	if (!SONARR_HOST || !SONARR_API_KEY) {
		throw new Error(
			"SONARR_HOST and SONARR_API_KEY environment variables are required",
		);
	}

	const url = `${SONARR_HOST}/api/v3${endpoint}`;

	const response = await fetch(url, {
		...options,
		headers: {
			"X-Api-Key": SONARR_API_KEY,
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

export async function getSeries(seriesId: number): Promise<SonarrSeries> {
	return (await makeRequest(`/series/${seriesId}`)) as SonarrSeries;
}

export async function getAllSeries(): Promise<SonarrSeries[]> {
	return (await makeRequest("/series")) as SonarrSeries[];
}

export async function searchSeries(term: string): Promise<SonarrSeries[]> {
	return (await makeRequest(
		`/series/lookup?term=${encodeURIComponent(term)}`,
	)) as SonarrSeries[];
}

export type MonitorOption =
	| "all"
	| "future"
	| "missing"
	| "existing"
	| "lastSeason"
	| "none";

export async function addSeries(
	title: string,
	year: number,
	tvdbId: number,
	monitorOption: MonitorOption,
): Promise<SonarrSeries> {
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

	const seriesData = {
		title,
		year,
		tvdbId,
		qualityProfileId: qualityProfiles[0]!.id,
		languageProfileId: 1,
		rootFolderPath: rootFolders[0]!.path,
		monitored: true,
		seasonFolder: true,
		addOptions: {
			monitor: monitorOption,
			searchForMissingEpisodes: true,
			searchForCutoffUnmetEpisodes: false,
		},
	};

	return (await makeRequest("/series", {
		method: "POST",
		body: JSON.stringify(seriesData),
	})) as SonarrSeries;
}

export async function removeSeries(
	seriesId: number,
	deleteFiles: boolean = false,
): Promise<void> {
	await makeRequest(`/series/${seriesId}?deleteFiles=${deleteFiles}`, {
		method: "DELETE",
	});
}

export async function deleteEpisodeFile(
	episodeFileId: number,
): Promise<void> {
	await makeRequest(`/episodefile/${episodeFileId}`, {
		method: "DELETE",
	});
}

export async function updateSeries(
	seriesId: number,
	seriesData: SonarrSeries,
): Promise<SonarrSeries> {
	return (await makeRequest(`/series/${seriesId}`, {
		method: "PUT",
		body: JSON.stringify(seriesData),
	})) as SonarrSeries;
}

export async function getEpisodes(
	seriesId: number,
): Promise<SonarrEpisode[]> {
	return (await makeRequest(
		`/episode?seriesId=${seriesId}`,
	)) as SonarrEpisode[];
}

export async function getQueue(): Promise<SonarrQueueResponse> {
	return (await makeRequest(
		"/queue?includeEpisode=true&includeSeries=true",
	)) as SonarrQueueResponse;
}

export async function getQualityProfiles(): Promise<SonarrQualityProfile[]> {
	return (await makeRequest("/qualityprofile")) as SonarrQualityProfile[];
}

export async function getRootFolders(): Promise<SonarrRootFolder[]> {
	return (await makeRequest("/rootfolder")) as SonarrRootFolder[];
}

export async function getCalendar(
	start?: string,
	end?: string,
	includeSeries: boolean = true,
): Promise<SonarrCalendarEpisode[]> {
	const params = new URLSearchParams();
	if (start) params.append("start", start);
	if (end) params.append("end", end);
	params.append("includeSeries", includeSeries.toString());

	const endpoint = `/calendar${params.toString() ? `?${params.toString()}` : ""}`;
	return (await makeRequest(endpoint)) as SonarrCalendarEpisode[];
}

export async function searchEpisodes(
	seriesId?: number,
	episodeIds?: number[],
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

	return (await makeRequest("/command", {
		method: "POST",
		body: JSON.stringify(commandBody),
	})) as SonarrCommand;
}

export async function getHistory(
	page: number = 1,
	pageSize: number = 20,
	includeSeries: boolean = true,
	includeEpisode: boolean = true,
): Promise<SonarrHistoryResponse> {
	const params = new URLSearchParams({
		page: page.toString(),
		pageSize: pageSize.toString(),
		includeSeries: includeSeries.toString(),
		includeEpisode: includeEpisode.toString(),
	});

	return (await makeRequest(`/history?${params.toString()}`)) as SonarrHistoryResponse;
}
