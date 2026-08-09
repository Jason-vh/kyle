import { Type } from "@sinclair/typebox";
import type { Tool } from "../agent/tool.ts";
import { jsonResult } from "../agent/tool-result.ts";
import { buildTable } from "../agent/table.ts";
import { titleWithYear } from "../../shared/media.ts";
import * as radarr from "./api.ts";
import {
  toPartialMovie,
  toMovieLookupResult,
  toPartialQueueItem,
  toPartialHistoryRecord,
} from "./utils.ts";

const emptyParams = Type.Object({});

/** A queue payload as it arrives back through JSON, so every field is optional. */
interface QueuedMovie {
  movie?: { title?: string; year?: number };
  status?: string;
  trackedDownloadState?: string;
  timeLeft?: string;
  quality?: string;
}

/** "Inception (2010)" from a result payload, or a bare noun when it has no title. */
function movieName(payload: unknown): string {
  const { title, year } = (payload ?? {}) as { title?: string; year?: number };
  return title ? titleWithYear(title, year) : "movie";
}

function movieQueueTable(payload: unknown) {
  const items = (payload as { downloads?: QueuedMovie[] })?.downloads ?? [];
  return buildTable(
    "Download queue",
    ["Movie", "Status", "Time left", "Quality"],
    items,
    (item) => [
      titleWithYear(item.movie?.title, item.movie?.year),
      item.trackedDownloadState ?? item.status ?? "\u2014",
      item.timeLeft ?? "\u2014",
      item.quality ?? "\u2014",
    ],
  );
}

const getRadarrMovieParams = Type.Object({
  radarrMovieId: Type.Number({
    description: "The ID of the movie to get information about",
  }),
});

export const getRadarrMovieTool: Tool<typeof getRadarrMovieParams> = {
  name: "get_radarr_movie",
  description: "Get information about a specific movie in Radarr by ID",
  parameters: getRadarrMovieParams,
  label: "Checking movie details in Radarr",
  summary: "Fetched movie details",
  async execute(_toolCallId, params) {
    const movie = await radarr.getMovie(params.radarrMovieId);
    return jsonResult(toPartialMovie(movie));
  },
};

export const getAllMoviesTool: Tool<typeof emptyParams> = {
  name: "get_all_movies",
  description: "Get all movies in the Radarr library",
  parameters: emptyParams,
  label: "Fetching movies from Radarr",
  summary: "Checked movie library",
  async execute() {
    const movies = await radarr.getMovies();
    return jsonResult(movies.map(toPartialMovie));
  },
};

const searchMoviesParams = Type.Object({
  title: Type.String({ description: "The title of the movie to search for" }),
});

export const searchMoviesTool: Tool<typeof searchMoviesParams> = {
  name: "search_movies",
  description:
    "Search for movies in external databases (TMDB). Returns lookup results, not library entries — use get_all_movies to check what's already in the library.",
  parameters: searchMoviesParams,
  label: "Searching for movies in Radarr",
  summary: (args) => `Searched for movie '${args.title}'`,
  async execute(_toolCallId, params) {
    const movies = await radarr.searchMovies(params.title);
    return jsonResult(movies.map(toMovieLookupResult));
  },
};

const addMovieParams = Type.Object({
  tmdbId: Type.Number({ description: "The TMDB ID of the movie to add" }),
});

export const addMovieTool: Tool<typeof addMovieParams> = {
  name: "add_movie",
  description:
    "Add a movie to Radarr. Requires TMDB ID. The movie will be monitored and downloaded (if available).",
  parameters: addMovieParams,
  label: "Adding movie to Radarr",
  action: true,
  summary: (_args, payload) => `Added ${movieName(payload)} to Radarr`,
  async execute(_toolCallId, params) {
    // Lookup canonical metadata via TMDB ID, then add
    const movieLookup = await radarr.lookupMovieByTmdbId(params.tmdbId);
    const result = await radarr.addMovie(movieLookup.title, movieLookup.year, params.tmdbId);
    return jsonResult({
      title: result.title,
      year: result.year,
      id: result.id,
      titleSlug: result.titleSlug,
      message: `Added "${result.title}" (${result.year}) to Radarr. If the movie is available, it will start downloading shortly.`,
    });
  },
};

const removeMovieParams = Type.Object({
  movieId: Type.Number({ description: "The Radarr ID of the movie to remove" }),
});

export const removeMovieTool: Tool<typeof removeMovieParams> = {
  name: "remove_movie",
  description: "Remove a movie from Radarr and delete files from disk",
  parameters: removeMovieParams,
  label: "Removing movie from Radarr",
  action: true,
  summary: (_args, payload) => `Removed ${movieName(payload)} from Radarr`,
  async execute(_toolCallId, params) {
    const movie = await radarr.getMovie(params.movieId);
    await radarr.removeMovie(params.movieId, true);
    return jsonResult({
      success: true,
      message: `Removed ${movie.title} (${movie.year}) from Radarr and deleted files from disk.`,
      title: movie.title,
      year: movie.year,
      tmdbId: movie.tmdbId,
      imdbId: movie.imdbId,
      titleSlug: movie.titleSlug,
      radarrId: params.movieId,
    });
  },
};

const getMovieQueueParams = Type.Object({
  movieId: Type.Optional(
    Type.Number({
      description: "Filter queue to a specific movie ID. Omit to see all queued items.",
    }),
  ),
});

export const getMovieQueueTool: Tool<typeof getMovieQueueParams> = {
  name: "get_movie_queue",
  description: "Get movies currently downloading or in the queue",
  parameters: getMovieQueueParams,
  label: "Checking movie download queue",
  summary: "Checked download queue (movies)",
  table: movieQueueTable,
  async execute(_toolCallId, params) {
    const queue = await radarr.getQueue({
      movieIds: params.movieId ? [params.movieId] : undefined,
    });
    return jsonResult({
      totalRecords: queue.totalRecords,
      downloads: queue.records.map(toPartialQueueItem),
    });
  },
};

const getMovieHistoryParams = Type.Object({
  pageSize: Type.Number({ description: "The number of items to return" }),
});

export const getMovieHistoryTool: Tool<typeof getMovieHistoryParams> = {
  name: "get_movie_history",
  description:
    "Get the history of movies in Radarr. Each item has a type, which indicates what action was taken (grabbed, downloaded, deleted, etc.). Grabbing in this context means to start downloading it. History can be quite noisy, and there may be an unexpected number of items returned.",
  parameters: getMovieHistoryParams,
  label: "Checking Radarr history",
  summary: "Checked movie history",
  async execute(_toolCallId, params) {
    const history = await radarr.getHistory(params.pageSize);
    return jsonResult(history.records.map(toPartialHistoryRecord));
  },
};

export const radarrTools = [
  getRadarrMovieTool,
  getAllMoviesTool,
  searchMoviesTool,
  addMovieTool,
  removeMovieTool,
  getMovieQueueTool,
  getMovieHistoryTool,
];
