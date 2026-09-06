import type { LibraryMediaType, LibraryState, MediaDetail, SeasonSummary } from "#shared/types.ts";
import * as radarr from "#server/radarr/api.ts";
import * as sonarr from "#server/sonarr/api.ts";
import * as tmdb from "#server/tmdb/api.ts";
import { yearOf } from "#server/tmdb/utils.ts";
import { movieState, seriesState } from "#server/library/item.ts";
import { buildSeasons } from "./seasons.ts";
import { progressFor } from "#server/requests/state.ts";
import { getRequestersForMedia } from "#server/db/requests.ts";
import { getWatchers, watchKey } from "#server/plex/history.ts";
import { createLogger } from "#server/logger.ts";
import { errorMessage } from "#server/errors.ts";

const log = createLogger("media-detail");

/** Everything TMDB knows, which is what the page is mostly made of. */
type Description = Pick<
  MediaDetail,
  | "title"
  | "year"
  | "tagline"
  | "overview"
  | "posterPath"
  | "backdropPath"
  | "runtime"
  | "genres"
  | "rating"
  | "status"
>;

async function describe(mediaType: LibraryMediaType, tmdbId: number): Promise<Description> {
  if (mediaType === "movie") {
    const movie = await tmdb.getMovie(tmdbId);
    return {
      title: movie.title,
      year: yearOf(movie.release_date),
      tagline: movie.tagline || undefined,
      overview: movie.overview || undefined,
      posterPath: movie.poster_path,
      backdropPath: movie.backdrop_path,
      runtime: movie.runtime || undefined,
      genres: movie.genres.map((genre) => genre.name),
      // An unrated title averages 0, which would read as the worst film ever made.
      rating: movie.vote_count > 0 ? movie.vote_average : undefined,
      status: movie.status || undefined,
    };
  }

  const show = await tmdb.getTVShow(tmdbId);
  return {
    title: show.name,
    year: yearOf(show.first_air_date),
    tagline: show.tagline || undefined,
    overview: show.overview || undefined,
    posterPath: show.poster_path,
    backdropPath: show.backdrop_path,
    runtime: show.episode_run_time?.[0] || undefined,
    genres: show.genres.map((genre) => genre.name),
    rating: show.vote_count > 0 ? show.vote_average : undefined,
    status: show.status || undefined,
  };
}

interface Held {
  state: LibraryState;
  seasons?: SeasonSummary[];
}

/**
 * What the service holds of this title, or nothing when it holds none. Asked of
 * the service directly rather than the cached index, so a service being down
 * can be said out loud instead of reading as "not in the library".
 */
async function heldState(mediaType: LibraryMediaType, tmdbId: number): Promise<Held | undefined> {
  if (mediaType === "movie") {
    const movie = await radarr.getLibraryMovieByTmdbId(tmdbId);
    return movie ? { state: movieState(movie) } : undefined;
  }

  // Sonarr cannot look a series up by TMDB id, so its own listing is the index.
  const series = (await sonarr.getAllSeries()).find((show) => show.tmdbId === tmdbId);
  if (!series) return undefined;

  const episodes = await sonarr.getEpisodes(series.id);
  return { state: seriesState(series), seasons: buildSeasons(series, episodes) };
}

function serviceName(mediaType: LibraryMediaType): string {
  return mediaType === "movie" ? "Radarr" : "Sonarr";
}

/**
 * One title in full. TMDB is the page, so a failure there fails the request;
 * everything else is an annotation, and its service being down costs only that
 * annotation.
 */
export async function getMediaDetail(
  mediaType: LibraryMediaType,
  tmdbId: number,
  viewerId: string,
): Promise<MediaDetail> {
  const [description, held, requesters, watchers] = await Promise.all([
    describe(mediaType, tmdbId),
    heldState(mediaType, tmdbId).catch((error) => {
      log.warn("library state unavailable", {
        source: serviceName(mediaType),
        tmdbId,
        error: errorMessage(error),
      });
      return null;
    }),
    getRequestersForMedia(mediaType, tmdbId),
    getWatchers(),
  ]);

  const library = held?.state;
  const download = library ? await progressFor(mediaType, library.serviceId) : undefined;

  return {
    mediaType,
    tmdbId,
    ...description,
    library,
    seasons: held?.seasons,
    progress: download?.progress,
    eta: download?.eta,
    requestedBy: requesters.map((requester) => requester.name),
    requestedByMe: requesters.some((requester) => requester.userId === viewerId),
    watchedBy: watchers.get(watchKey(mediaType, tmdbId)) ?? [],
    unavailable: held === null ? [serviceName(mediaType)] : [],
  };
}
