import type {
  SonarrCalendarEpisode,
  SonarrCommand,
  SonarrEpisode,
  SonarrHistoryItem,
  SonarrHistoryResponse,
  SonarrManualImportItem,
  SonarrQualityProfile,
  SonarrQueueResponse,
  SonarrRootFolder,
  SonarrSeries,
} from "./types.ts";
import { createApiClient } from "../http/client.ts";
import { requireEnv } from "../config.ts";

const request = createApiClient({
  service: "sonarr",
  config: () => {
    const [host, apiKey] = requireEnv("SONARR_HOST", "SONARR_API_KEY");
    return {
      baseUrl: `${host}/api/v3`,
      headers: { "X-Api-Key": apiKey, "Content-Type": "application/json" },
    };
  },
});

export async function getSeries(seriesId: number): Promise<SonarrSeries> {
  return request<SonarrSeries>(`/series/${seriesId}`);
}

export async function getAllSeries(): Promise<SonarrSeries[]> {
  return request<SonarrSeries[]>("/series");
}

export async function searchSeries(term: string): Promise<SonarrSeries[]> {
  return request<SonarrSeries[]>(`/series/lookup?term=${encodeURIComponent(term)}`);
}

export type MonitorOption =
  | "all"
  | "future"
  | "missing"
  | "existing"
  | "pilot"
  | "firstSeason"
  | "lastSeason"
  | "monitorSpecials"
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

  return request<SonarrSeries>("/series", {
    method: "POST",
    body: JSON.stringify(seriesData),
  });
}

export async function removeSeries(seriesId: number, deleteFiles: boolean = false): Promise<void> {
  await request<void>(`/series/${seriesId}?deleteFiles=${deleteFiles}`, {
    method: "DELETE",
  });
}

export async function deleteEpisodeFile(episodeFileId: number): Promise<void> {
  await request<void>(`/episodefile/${episodeFileId}`, {
    method: "DELETE",
  });
}

export async function updateSeries(
  seriesId: number,
  seriesData: SonarrSeries,
): Promise<SonarrSeries> {
  return request<SonarrSeries>(`/series/${seriesId}`, {
    method: "PUT",
    body: JSON.stringify(seriesData),
  });
}

export async function getEpisodes(seriesId: number): Promise<SonarrEpisode[]> {
  return request<SonarrEpisode[]>(`/episode?seriesId=${seriesId}`);
}

export async function getQueue(options?: { seriesIds?: number[] }): Promise<SonarrQueueResponse> {
  const params = new URLSearchParams({
    includeEpisode: "true",
    includeSeries: "true",
    pageSize: "1000",
  });
  const response = await request<SonarrQueueResponse>(`/queue?${params.toString()}`);

  // Sonarr's queue endpoint doesn't support server-side filtering, so filter client-side
  if (options?.seriesIds?.length) {
    const idSet = new Set(options.seriesIds);
    response.records = response.records.filter((r) => r.seriesId && idSet.has(r.seriesId));
    response.totalRecords = response.records.length;
  }
  return response;
}

export async function getQualityProfiles(): Promise<SonarrQualityProfile[]> {
  return request<SonarrQualityProfile[]>("/qualityprofile");
}

export async function getRootFolders(): Promise<SonarrRootFolder[]> {
  return request<SonarrRootFolder[]>("/rootfolder");
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
  return request<SonarrCalendarEpisode[]>(endpoint);
}

export async function monitorEpisodes(
  episodeIds: number[],
  monitored: boolean,
): Promise<SonarrEpisode[]> {
  return request<SonarrEpisode[]>("/episode/monitor", {
    method: "PUT",
    body: JSON.stringify({ episodeIds, monitored }),
  });
}

export async function searchEpisodes(
  seriesId?: number,
  episodeIds?: number[],
  seasonNumber?: number,
): Promise<SonarrCommand> {
  const commandBody: Record<string, unknown> = {};

  if (seriesId && seasonNumber !== undefined) {
    commandBody.name = "SeasonSearch";
    commandBody.seriesId = seriesId;
    commandBody.seasonNumber = seasonNumber;
  } else if (seriesId && !episodeIds) {
    commandBody.name = "SeriesSearch";
    commandBody.seriesId = seriesId;
  } else if (episodeIds && episodeIds.length > 0) {
    commandBody.name = "EpisodeSearch";
    commandBody.episodeIds = episodeIds;
  } else {
    throw new Error("Must provide either seriesId or episodeIds");
  }

  return request<SonarrCommand>("/command", {
    method: "POST",
    body: JSON.stringify(commandBody),
  });
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

  return request<SonarrHistoryResponse>(`/history?${params.toString()}`);
}

export async function getSeriesHistory(
  seriesId: number,
  includeSeries: boolean = true,
  includeEpisode: boolean = true,
): Promise<SonarrHistoryItem[]> {
  const params = new URLSearchParams({
    seriesId: seriesId.toString(),
    includeSeries: includeSeries.toString(),
    includeEpisode: includeEpisode.toString(),
  });

  return request<SonarrHistoryItem[]>(`/history/series?${params.toString()}`);
}

export async function getManualImport(
  downloadId: string,
  seriesId?: number,
): Promise<SonarrManualImportItem[]> {
  const params = new URLSearchParams({ downloadId });
  if (seriesId !== undefined) params.append("seriesId", seriesId.toString());

  return request<SonarrManualImportItem[]>(`/manualimport?${params.toString()}`);
}

export async function triggerManualImport(
  files: Array<{
    path: string;
    seriesId: number;
    seasonNumber: number;
    episodeIds: number[];
    quality: SonarrManualImportItem["quality"];
    languages: NonNullable<SonarrManualImportItem["languages"]>;
  }>,
): Promise<SonarrCommand> {
  return request<SonarrCommand>("/command", {
    method: "POST",
    body: JSON.stringify({
      name: "ManualImport",
      files,
      importMode: "move",
    }),
  });
}
