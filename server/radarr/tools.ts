import { Type } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import * as radarr from "./api.ts";
import {
  toPartialMovie,
  toMovieLookupResult,
  toPartialQueueItem,
  toPartialHistoryRecord,
} from "./utils.ts";

const emptyParams = Type.Object({});

const getRadarrMovieParams = Type.Object({
  radarrMovieId: Type.Number({
    description: "The ID of the movie to get information about",
  }),
});

export const getRadarrMovieTool: AgentTool<typeof getRadarrMovieParams> = {
  name: "get_radarr_movie",
  description: "Get information about a specific movie in Radarr by ID",
  parameters: getRadarrMovieParams,
  label: "Checking movie details in Radarr",
  async execute(_toolCallId, params) {
    const movie = await radarr.getMovie(params.radarrMovieId);
    return {
      content: [{ type: "text", text: JSON.stringify(toPartialMovie(movie)) }],
      details: undefined,
    };
  },
};

export const getAllMoviesTool: AgentTool<typeof emptyParams> = {
  name: "get_all_movies",
  description: "Get all movies in the Radarr library",
  parameters: emptyParams,
  label: "Fetching movies from Radarr",
  async execute() {
    const movies = await radarr.getMovies();
    return {
      content: [{ type: "text", text: JSON.stringify(movies.map(toPartialMovie)) }],
      details: undefined,
    };
  },
};

const searchMoviesParams = Type.Object({
  title: Type.String({ description: "The title of the movie to search for" }),
});

export const searchMoviesTool: AgentTool<typeof searchMoviesParams> = {
  name: "search_movies",
  description:
    "Search for movies in external databases (TMDB). Returns lookup results, not library entries — use get_all_movies to check what's already in the library.",
  parameters: searchMoviesParams,
  label: "Searching for movies in Radarr",
  async execute(_toolCallId, params) {
    const movies = await radarr.searchMovies(params.title);
    return {
      content: [{ type: "text", text: JSON.stringify(movies.map(toMovieLookupResult)) }],
      details: undefined,
    };
  },
};

const addMovieParams = Type.Object({
  tmdbId: Type.Number({ description: "The TMDB ID of the movie to add" }),
});

export const addMovieTool: AgentTool<typeof addMovieParams> = {
  name: "add_movie",
  description:
    "Add a movie to Radarr. Requires TMDB ID. The movie will be monitored and downloaded (if available).",
  parameters: addMovieParams,
  label: "Adding movie to Radarr",
  async execute(_toolCallId, params) {
    // Lookup canonical metadata via TMDB ID, then add
    const movieLookup = await radarr.lookupMovieByTmdbId(params.tmdbId);
    const result = await radarr.addMovie(movieLookup.title, movieLookup.year, params.tmdbId);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            title: result.title,
            year: result.year,
            id: result.id,
            titleSlug: result.titleSlug,
            message: `Added "${result.title}" (${result.year}) to Radarr. If the movie is available, it will start downloading shortly.`,
          }),
        },
      ],
      details: undefined,
    };
  },
};

const removeMovieParams = Type.Object({
  movieId: Type.Number({ description: "The Radarr ID of the movie to remove" }),
});

export const removeMovieTool: AgentTool<typeof removeMovieParams> = {
  name: "remove_movie",
  description: "Remove a movie from Radarr and delete files from disk",
  parameters: removeMovieParams,
  label: "Removing movie from Radarr",
  async execute(_toolCallId, params) {
    const movie = await radarr.getMovie(params.movieId);
    await radarr.removeMovie(params.movieId, true);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            message: `Removed ${movie.title} (${movie.year}) from Radarr and deleted files from disk.`,
            title: movie.title,
            tmdbId: movie.tmdbId,
            imdbId: movie.imdbId,
            titleSlug: movie.titleSlug,
            radarrId: params.movieId,
          }),
        },
      ],
      details: undefined,
    };
  },
};

export const getMovieQueueTool: AgentTool<typeof emptyParams> = {
  name: "get_movie_queue",
  description: "Get movies currently downloading or in the queue",
  parameters: emptyParams,
  label: "Checking movie download queue",
  async execute() {
    const queue = await radarr.getQueue();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            totalRecords: queue.totalRecords,
            downloads: queue.records.map(toPartialQueueItem),
          }),
        },
      ],
      details: undefined,
    };
  },
};

const getMovieHistoryParams = Type.Object({
  pageSize: Type.Number({ description: "The number of items to return" }),
});

export const getMovieHistoryTool: AgentTool<typeof getMovieHistoryParams> = {
  name: "get_movie_history",
  description:
    "Get the history of movies in Radarr. Each item has a type, which indicates what action was taken (grabbed, downloaded, deleted, etc.). Grabbing in this context means to start downloading it. History can be quite noisy, and there may be an unexpected number of items returned.",
  parameters: getMovieHistoryParams,
  label: "Checking Radarr history",
  async execute(_toolCallId, params) {
    const history = await radarr.getHistory(params.pageSize);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(history.records.map(toPartialHistoryRecord)),
        },
      ],
      details: undefined,
    };
  },
};
