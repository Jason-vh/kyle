import type { RadarrHistoryResponse, RadarrMovie, RadarrQueueResponse } from "./types.ts";

const RADARR_HOST = process.env.RADARR_HOST;
const RADARR_API_KEY = process.env.RADARR_API_KEY;

async function makeRequest(endpoint: string, options: RequestInit = {}): Promise<unknown> {
  if (!RADARR_HOST || !RADARR_API_KEY) {
    throw new Error("RADARR_HOST and RADARR_API_KEY environment variables are required");
  }

  const url = `${RADARR_HOST}/api/v3${endpoint}`;

  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(15_000),
    headers: {
      "X-Api-Key": RADARR_API_KEY,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      parsed = body;
    }
    throw new Error(
      `Radarr API error ${response.status} ${response.statusText}: ${JSON.stringify(parsed)}`,
    );
  }

  return response.json();
}

export async function getMovie(id: number): Promise<RadarrMovie> {
  return (await makeRequest(`/movie/${id}`)) as RadarrMovie;
}

export async function getMovies(): Promise<RadarrMovie[]> {
  return (await makeRequest("/movie")) as RadarrMovie[];
}

export async function searchMovies(title: string): Promise<RadarrMovie[]> {
  return (await makeRequest(`/movie/lookup?term=${encodeURIComponent(title)}`)) as RadarrMovie[];
}

export async function lookupMovieByTmdbId(tmdbId: number): Promise<RadarrMovie> {
  return (await makeRequest(`/movie/lookup/tmdb?tmdbId=${tmdbId}`)) as RadarrMovie;
}

export async function addMovie(title: string, year: number, tmdbId: number): Promise<RadarrMovie> {
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

export async function removeMovie(movieId: number, deleteFiles: boolean = true): Promise<void> {
  await makeRequest(`/movie/${movieId}?deleteFiles=${deleteFiles}`, {
    method: "DELETE",
  });
}

export async function getQueue(): Promise<RadarrQueueResponse> {
  return (await makeRequest("/queue?includeMovie=true")) as RadarrQueueResponse;
}

export async function getHistory(pageSize: number = 20): Promise<RadarrHistoryResponse> {
  return (await makeRequest(
    `/history?includeMovie=true&pageSize=${pageSize}`,
  )) as RadarrHistoryResponse;
}
