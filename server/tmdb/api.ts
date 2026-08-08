import type {
  TMDBMovie,
  TMDBMovieDetails,
  TMDBMultiResult,
  TMDBSearchOptions,
  TMDBSearchResponse,
  TMDBTVShow,
  TMDBTVShowDetails,
} from "./types.ts";
import { createApiClient } from "../http/client.ts";
import { requireEnv } from "../config.ts";

const request = createApiClient({
  service: "tmdb",
  config: () => {
    const [token] = requireEnv("TMDB_API_TOKEN");
    return {
      baseUrl: "https://api.themoviedb.org/3",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    };
  },
});

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
  return request<TMDBSearchResponse<TMDBMovie>>(`/search/movie?${queryString}`);
}

export async function searchTV(
  query: string,
  options?: TMDBSearchOptions,
): Promise<TMDBSearchResponse<TMDBTVShow>> {
  const queryString = buildQueryString(query, options);
  return request<TMDBSearchResponse<TMDBTVShow>>(`/search/tv?${queryString}`);
}

export async function searchMulti(
  query: string,
  options?: TMDBSearchOptions,
): Promise<TMDBSearchResponse<TMDBMultiResult>> {
  const queryString = buildQueryString(query, options);
  return request<TMDBSearchResponse<TMDBMultiResult>>(`/search/multi?${queryString}`);
}

export async function getMovie(movieId: number): Promise<TMDBMovieDetails> {
  return request<TMDBMovieDetails>(`/movie/${movieId}`);
}

export async function getTVShow(tvId: number): Promise<TMDBTVShowDetails> {
  return request<TMDBTVShowDetails>(`/tv/${tvId}`);
}
