import type { RadarrHistoryResponse, RadarrMovie, RadarrQueueResponse } from "./types.ts";
import { createApiClient } from "../http/client.ts";
import { requireEnv } from "../config.ts";

const request = createApiClient({
  service: "radarr",
  config: () => {
    const [host, apiKey] = requireEnv("RADARR_HOST", "RADARR_API_KEY");
    return {
      baseUrl: `${host}/api/v3`,
      headers: { "X-Api-Key": apiKey, "Content-Type": "application/json" },
    };
  },
});

export async function getMovie(id: number): Promise<RadarrMovie> {
  return request<RadarrMovie>(`/movie/${id}`);
}

export async function getMovies(): Promise<RadarrMovie[]> {
  return request<RadarrMovie[]>("/movie");
}

export async function searchMovies(title: string): Promise<RadarrMovie[]> {
  return request<RadarrMovie[]>(`/movie/lookup?term=${encodeURIComponent(title)}`);
}

export async function lookupMovieByTmdbId(tmdbId: number): Promise<RadarrMovie> {
  return request<RadarrMovie>(`/movie/lookup/tmdb?tmdbId=${tmdbId}`);
}

/**
 * The library entry for a TMDB id, if Radarr already has it. Unlike Sonarr,
 * Radarr's lookup reports no id for a movie it already holds, so membership
 * has to be asked of the library itself.
 */
export async function getLibraryMovieByTmdbId(tmdbId: number): Promise<RadarrMovie | undefined> {
  const [movie] = await request<RadarrMovie[]>(`/movie?tmdbId=${tmdbId}`);
  return movie;
}

export async function addMovie(title: string, year: number, tmdbId: number): Promise<RadarrMovie> {
  const [qualityProfiles, rootFolders] = await Promise.all([
    request<{ id: number }[]>("/qualityprofile"),
    request<{ path: string }[]>("/rootfolder"),
  ]);

  const qualityProfile = qualityProfiles[0];
  const rootFolder = rootFolders[0];
  if (!qualityProfile || !rootFolder) {
    throw new Error("No quality profiles or root folders configured");
  }

  const movieData = {
    title,
    year,
    tmdbId,
    qualityProfileId: qualityProfile.id,
    rootFolderPath: rootFolder.path,
    path: `${rootFolder.path}/${title} (${year})`,
    monitored: true,
    searchForMovie: true,
    addOptions: {
      searchForMovie: true,
    },
  };

  return request<RadarrMovie>("/movie", {
    method: "POST",
    body: JSON.stringify(movieData),
  });
}

export async function removeMovie(movieId: number, deleteFiles: boolean = true): Promise<void> {
  await request<void>(`/movie/${movieId}?deleteFiles=${deleteFiles}`, {
    method: "DELETE",
  });
}

export async function getQueue(options?: { movieIds?: number[] }): Promise<RadarrQueueResponse> {
  const params = new URLSearchParams({
    includeMovie: "true",
    pageSize: "1000",
  });
  const response = await request<RadarrQueueResponse>(`/queue?${params.toString()}`);

  // Radarr's queue endpoint may not support server-side filtering, so filter client-side
  if (options?.movieIds?.length) {
    const idSet = new Set(options.movieIds);
    response.records = response.records.filter((r) => r.movie?.id && idSet.has(r.movie.id));
    response.totalRecords = response.records.length;
  }
  return response;
}

export async function getHistory(pageSize: number = 20): Promise<RadarrHistoryResponse> {
  return request<RadarrHistoryResponse>(`/history?includeMovie=true&pageSize=${pageSize}`);
}
