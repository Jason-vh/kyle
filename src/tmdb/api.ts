import type {
  TMDBMovie,
  TMDBMovieDetails,
  TMDBMultiResult,
  TMDBSearchOptions,
  TMDBSearchResponse,
  TMDBTVShow,
  TMDBTVShowDetails,
} from "./types.ts";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_API_TOKEN = process.env.TMDB_API_TOKEN;

async function makeRequest(endpoint: string, options: RequestInit = {}): Promise<unknown> {
  if (!TMDB_API_TOKEN) {
    throw new Error("TMDB_API_TOKEN environment variable is required");
  }

  const url = `${TMDB_BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${TMDB_API_TOKEN}`,
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
      `TMDB API error ${response.status} ${response.statusText}: ${JSON.stringify(parsed)}`,
    );
  }

  return response.json();
}

function buildQueryString(query: string, options?: TMDBSearchOptions): string {
  const params = new URLSearchParams({ query });

  if (options?.language) params.append("language", options.language);
  if (options?.page) params.append("page", options.page.toString());
  if (options?.include_adult !== undefined)
    params.append("include_adult", options.include_adult.toString());
  if (options?.region) params.append("region", options.region);
  if (options?.year) params.append("year", options.year.toString());
  if (options?.primary_release_year)
    params.append("primary_release_year", options.primary_release_year.toString());

  return params.toString();
}

export async function searchMovies(
  query: string,
  options?: TMDBSearchOptions,
): Promise<TMDBSearchResponse<TMDBMovie>> {
  const queryString = buildQueryString(query, options);
  return (await makeRequest(`/search/movie?${queryString}`)) as TMDBSearchResponse<TMDBMovie>;
}

export async function searchTV(
  query: string,
  options?: TMDBSearchOptions,
): Promise<TMDBSearchResponse<TMDBTVShow>> {
  const queryString = buildQueryString(query, options);
  return (await makeRequest(`/search/tv?${queryString}`)) as TMDBSearchResponse<TMDBTVShow>;
}

export async function searchMulti(
  query: string,
  options?: TMDBSearchOptions,
): Promise<TMDBSearchResponse<TMDBMultiResult>> {
  const queryString = buildQueryString(query, options);
  return (await makeRequest(`/search/multi?${queryString}`)) as TMDBSearchResponse<TMDBMultiResult>;
}

export async function getMovie(movieId: number): Promise<TMDBMovieDetails> {
  return (await makeRequest(`/movie/${movieId}`)) as TMDBMovieDetails;
}

export async function getTVShow(tvId: number): Promise<TMDBTVShowDetails> {
  return (await makeRequest(`/tv/${tvId}`)) as TMDBTVShowDetails;
}
