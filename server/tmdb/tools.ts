import { Type } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import * as tmdb from "./api.ts";
import {
  toPartialMovie,
  toPartialTVShow,
  toPartialMultiResult,
  toPartialMovieDetails,
  toPartialTVShowDetails,
} from "./utils.ts";

const searchTmdbMoviesParams = Type.Object({
  query: Type.String({
    description: "The movie title or search query to look for",
  }),
  year: Type.Optional(
    Type.Number({
      description: "Optional: Filter results by release year",
    }),
  ),
  page: Type.Optional(
    Type.Number({
      description: "Optional: Page number for pagination (default: 1)",
    }),
  ),
});

export const searchTmdbMoviesTool: AgentTool<typeof searchTmdbMoviesParams> = {
  name: "search_tmdb_movies",
  description:
    "Search for movies on The Movie Database (TMDB). Use this to find movies by title, get TMDB IDs, release dates, ratings, and overviews. This is useful when users want to find a specific movie or get information about a movie before adding it to Radarr.",
  parameters: searchTmdbMoviesParams,
  label: "Searching for movies on TMDB",
  async execute(_toolCallId, params) {
    const results = await tmdb.searchMovies(params.query, {
      year: params.year,
      page: params.page,
      include_adult: false,
    });
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            page: results.page,
            total_pages: results.total_pages,
            total_results: results.total_results,
            results: results.results.map(toPartialMovie),
          }),
        },
      ],
      details: undefined,
    };
  },
};

const searchTmdbSeriesParams = Type.Object({
  query: Type.String({
    description: "The TV show name or search query to look for",
  }),
  page: Type.Optional(
    Type.Number({
      description: "Optional: Page number for pagination (default: 1)",
    }),
  ),
});

export const searchTmdbSeriesTool: AgentTool<typeof searchTmdbSeriesParams> = {
  name: "search_tmdb_series",
  description:
    "Search for TV shows on The Movie Database (TMDB). Use this to find TV shows by name, get TMDB IDs, first air dates, ratings, and overviews. This is useful when users want to find a specific TV show or get information about a show before adding it to Sonarr.",
  parameters: searchTmdbSeriesParams,
  label: "Searching for TV shows on TMDB",
  async execute(_toolCallId, params) {
    const results = await tmdb.searchTV(params.query, {
      page: params.page,
      include_adult: false,
    });
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            page: results.page,
            total_pages: results.total_pages,
            total_results: results.total_results,
            results: results.results.map(toPartialTVShow),
          }),
        },
      ],
      details: undefined,
    };
  },
};

const searchTmdbParams = Type.Object({
  query: Type.String({
    description: "The search query to look for across all media types",
  }),
  page: Type.Optional(
    Type.Number({
      description: "Optional: Page number for pagination (default: 1)",
    }),
  ),
});

export const searchTmdbTool: AgentTool<typeof searchTmdbParams> = {
  name: "search_tmdb",
  description:
    "Search for movies, TV shows, and people on The Movie Database (TMDB) in a single query. Use this when users make a general search request without specifying whether they want movies or TV shows, or when they might be looking for a person. Results include a media_type field to distinguish between 'movie', 'tv', and 'person'.",
  parameters: searchTmdbParams,
  label: "Searching TMDB",
  async execute(_toolCallId, params) {
    const results = await tmdb.searchMulti(params.query, {
      page: params.page,
      include_adult: false,
    });
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            page: results.page,
            total_pages: results.total_pages,
            total_results: results.total_results,
            results: results.results.map(toPartialMultiResult),
          }),
        },
      ],
      details: undefined,
    };
  },
};

const getTmdbMovieDetailsParams = Type.Object({
  tmdbMovieId: Type.Number({
    description: "The TMDB ID of the movie to get details for",
  }),
});

export const getTmdbMovieDetailsTool: AgentTool<typeof getTmdbMovieDetailsParams> = {
  name: "get_tmdb_movie_details",
  description:
    "Get detailed information about a specific movie from TMDB by its TMDB ID. This provides comprehensive details including runtime, budget, revenue, genres, production companies, IMDB ID, and more. Use this after you've searched for a movie and have its TMDB ID.",
  parameters: getTmdbMovieDetailsParams,
  label: "Fetching movie details from TMDB",
  async execute(_toolCallId, params) {
    const movie = await tmdb.getMovie(params.tmdbMovieId);
    return {
      content: [{ type: "text", text: JSON.stringify(toPartialMovieDetails(movie)) }],
      details: undefined,
    };
  },
};

const getTmdbSeriesDetailsParams = Type.Object({
  tmdbTVId: Type.Number({
    description: "The TMDB ID of the TV show to get details for",
  }),
});

export const getTmdbSeriesDetailsTool: AgentTool<typeof getTmdbSeriesDetailsParams> = {
  name: "get_tmdb_series_details",
  description:
    "Get detailed information about a specific TV show from TMDB by its TMDB ID. This provides comprehensive details including number of seasons, episodes, networks, creators, episode runtime, genres, and season information. Use this after you've searched for a TV show and have its TMDB ID.",
  parameters: getTmdbSeriesDetailsParams,
  label: "Fetching TV show details from TMDB",
  async execute(_toolCallId, params) {
    const show = await tmdb.getTVShow(params.tmdbTVId);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(toPartialTVShowDetails(show)),
        },
      ],
      details: undefined,
    };
  },
};
