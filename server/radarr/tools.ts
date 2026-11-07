import { Type } from "typebox";
import type { Tool, ToolPresentation } from "#server/agent/tool.ts";
import { jsonResult } from "#server/agent/tool-result.ts";
import { buildTable } from "#server/agent/table.ts";
import { requestMovie, type Requester } from "#server/requests/service.ts";
import { removeLibraryItem } from "#server/library/service.ts";
import { discardStalled } from "#server/requests/retry.ts";
import { localToday } from "#server/time/days.ts";
import { titleWithYear } from "#shared/media.ts";
import * as radarr from "./api.ts";
import {
  toPartialMovie,
  toMovieLookupResult,
  toPartialQueueItem,
  toPartialHistoryRecord,
  toMovieDetails,
  summarizeReleases,
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

const getRadarrMovieTool: Tool<typeof getRadarrMovieParams> = {
  name: "get_radarr_movie",
  description:
    "Get information about a specific movie in Radarr by ID, including when it is out in cinemas, digitally and physically. `isAvailable` is whether it has reached its `minimumAvailability`; until then Radarr's scheduled searches skip it.",
  parameters: getRadarrMovieParams,
  label: "Checking movie details in Radarr",
  summary: "Fetched movie details",
  async execute(params) {
    const movie = await radarr.getMovie(params.radarrMovieId);
    return jsonResult(toMovieDetails(movie, localToday()));
  },
};

const findLibraryMovieParams = Type.Object({
  tmdbId: Type.Number({ description: "The TMDB ID of the movie to look for" }),
});

const findLibraryMovieTool: Tool<typeof findLibraryMovieParams> = {
  name: "find_library_movie",
  description:
    "Check whether a movie is in the Radarr library by its TMDB ID, and if so return the same details as get_radarr_movie. Use this rather than get_all_movies when asking about one movie.",
  parameters: findLibraryMovieParams,
  label: "Looking for movie in Radarr",
  summary: "Checked the library for a movie",
  async execute(params) {
    const movie = await radarr.getLibraryMovieByTmdbId(params.tmdbId);
    if (!movie) return jsonResult({ inLibrary: false });
    return jsonResult({ inLibrary: true, ...toMovieDetails(movie, localToday()) });
  },
};

const getAllMoviesTool: Tool<typeof emptyParams> = {
  name: "get_all_movies",
  description:
    "Get all movies in the Radarr library. For a single movie, find_library_movie is far cheaper.",
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

const searchMoviesTool: Tool<typeof searchMoviesParams> = {
  name: "search_movies",
  description:
    "Search for movies in external databases (TMDB). Returns lookup results, not library entries — use get_all_movies to check what's already in the library.",
  parameters: searchMoviesParams,
  label: "Searching for movies in Radarr",
  summary: (args) => `Searched for movie '${args.title}'`,
  async execute(params) {
    const movies = await radarr.searchMovies(params.title);
    return jsonResult(movies.map(toMovieLookupResult));
  },
};

const addMovieParams = Type.Object({
  tmdbId: Type.Number({ description: "The TMDB ID of the movie to add" }),
});

/** Bound to the requester at call time, so the registry indexes it separately. */
const addMoviePresentation: ToolPresentation = {
  name: "add_movie",
  label: "Adding movie to Radarr",
  action: true,
  summary: (_args, payload) => {
    if ((payload as { alreadyInLibrary?: boolean })?.alreadyInLibrary) {
      return `${movieName(payload)} was already in Radarr`;
    }
    return `Added ${movieName(payload)} to Radarr`;
  },
};

export function createAddMovieTool(requestedBy?: Requester): Tool<typeof addMovieParams> {
  return {
    ...addMoviePresentation,
    description:
      "Add a movie to Radarr. Requires TMDB ID. The movie will be monitored and downloaded (if available). Adding one already in the library is safe and changes nothing.",
    parameters: addMovieParams,
    async execute(params) {
      const { status, movie } = await requestMovie({ tmdbId: params.tmdbId, requestedBy });
      const name = titleWithYear(movie.title, movie.year);
      return jsonResult({
        title: movie.title,
        year: movie.year,
        id: movie.id,
        titleSlug: movie.titleSlug,
        alreadyInLibrary: status === "existing",
        message:
          status === "existing"
            ? `${name} is already in Radarr.`
            : `Added ${name} to Radarr. If the movie is available, it will start downloading shortly.`,
      });
    },
  };
}

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
  async execute(params) {
    const movie = await removeLibraryItem("movie", params.movieId, true, { name: "Kyle" });
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

const downloadMovieParams = Type.Object({
  movieId: Type.Number({ description: "The Radarr ID of the movie to download" }),
});

async function grabSince(movieId: number, since: string) {
  const history = await radarr.getMovieHistory(movieId);
  return history.find(
    (record) => record.eventType === "grabbed" && Date.parse(record.date) >= Date.parse(since),
  );
}

function searchOutcome(status: string | undefined, release: string | undefined): string {
  if (status === undefined) {
    return "Radarr is still searching after a minute; check get_movie_queue again later.";
  }
  if (status !== "completed") return `Radarr's search ended as ${status}.`;
  if (release) {
    return `Radarr grabbed ${release}. It shows in get_movie_queue once Radarr next checks the download client, usually within a minute.`;
  }
  return "Radarr searched and grabbed nothing; get_movie_releases says why.";
}

export const downloadMovieTool: Tool<typeof downloadMovieParams> = {
  name: "download_movie",
  description:
    "Search indexers now for a movie already in Radarr and grab the best release, instead of waiting for Radarr's scheduled search. A stalled download of it is dropped and blocklisted first. A search started here ignores the movie's minimumAvailability, so check get_movie_releases first when the movie is not yet `isAvailable`, and only go ahead when it has an approved release that is not a camrip.",
  parameters: downloadMovieParams,
  label: "Downloading movie from Radarr",
  action: true,
  summary: (_args, payload) => {
    if ((payload as { grabbed?: unknown })?.grabbed) return `Grabbed ${movieName(payload)}`;
    return `Searched for ${movieName(payload)}`;
  },
  async execute(params) {
    const movie = await radarr.getMovie(params.movieId);
    const discarded = await discardStalled("movie", params.movieId);
    const search = await radarr.searchMovie(params.movieId);
    const finished = await radarr.waitForCommand(search.id);
    const grab = finished ? await grabSince(params.movieId, search.queued) : undefined;
    return jsonResult({
      title: movie.title,
      year: movie.year,
      radarrId: movie.id,
      tmdbId: movie.tmdbId,
      imdbId: movie.imdbId,
      titleSlug: movie.titleSlug,
      discardedStalledDownloads: discarded,
      grabbed: grab ? { release: grab.sourceTitle, quality: grab.quality.quality.name } : null,
      message: searchOutcome(finished?.status, grab?.sourceTitle),
    });
  },
};

const getMovieReleasesParams = Type.Object({
  movieId: Type.Number({ description: "The Radarr ID of the movie" }),
});

const getMovieReleasesTool: Tool<typeof getMovieReleasesParams> = {
  name: "get_movie_releases",
  description:
    "Ask the indexers which releases they have right now for a movie in the library, best first by Radarr's own ranking. `approved` are ones Radarr would take, `rejected` the best it would refuse, with why. This is how to answer whether a good version is available — not web search. It grabs nothing; download_movie grabs the best approved release.",
  parameters: getMovieReleasesParams,
  label: "Searching indexers for releases",
  summary: "Checked available releases",
  async execute(params) {
    const releases = await radarr.getReleases(params.movieId);
    return jsonResult(summarizeReleases(releases));
  },
};

const getMovieQueueParams = Type.Object({
  movieId: Type.Optional(
    Type.Number({
      description: "Filter queue to a specific movie ID. Omit to see all queued items.",
    }),
  ),
});

const getMovieQueueTool: Tool<typeof getMovieQueueParams> = {
  name: "get_movie_queue",
  description: "Get movies currently downloading or in the queue",
  parameters: getMovieQueueParams,
  label: "Checking movie download queue",
  summary: "Checked download queue (movies)",
  table: movieQueueTable,
  async execute(params) {
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
  movieId: Type.Optional(
    Type.Number({
      description: "The Radarr ID of one movie, to get everything Radarr has done with it",
    }),
  ),
  pageSize: Type.Optional(
    Type.Number({
      description: "How many of the latest events to return when no movieId is given",
    }),
  ),
});

const getMovieHistoryTool: Tool<typeof getMovieHistoryParams> = {
  name: "get_movie_history",
  description:
    "Get the history of movies in Radarr. Each item has a type, which indicates what action was taken (grabbed, downloaded, deleted, etc.). Grabbing in this context means to start downloading it. History can be quite noisy, and there may be an unexpected number of items returned.",
  parameters: getMovieHistoryParams,
  label: "Checking Radarr history",
  summary: "Checked movie history",
  async execute(params) {
    if (params.movieId !== undefined) {
      const records = await radarr.getMovieHistory(params.movieId);
      return jsonResult(records.map(toPartialHistoryRecord));
    }
    const history = await radarr.getHistory(params.pageSize);
    return jsonResult(history.records.map(toPartialHistoryRecord));
  },
};

export const radarrTools = [
  getRadarrMovieTool,
  getAllMoviesTool,
  findLibraryMovieTool,
  searchMoviesTool,
  removeMovieTool,
  downloadMovieTool,
  getMovieReleasesTool,
  getMovieQueueTool,
  getMovieHistoryTool,
];
