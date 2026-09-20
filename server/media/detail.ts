import type { LibraryMediaType, LibraryState, MediaDetail, SeasonSummary } from "#shared/types.ts";
import * as radarr from "#server/radarr/api.ts";
import * as sonarr from "#server/sonarr/api.ts";
import * as tmdb from "#server/tmdb/api.ts";
import { yearOf } from "#server/tmdb/utils.ts";
import { movieState, seriesState } from "#server/library/item.ts";
import { buildSeasons, withEpisodeWatchers, type SeasonContext } from "./seasons.ts";
import {
  placeOf,
  queueStatusBySeason,
  queueStatusFor,
  type PlexPlace,
} from "#server/requests/state.ts";
import { getRequestersForMedia } from "#server/db/requests.ts";
import { getWatchers, watchKey } from "#server/plex/history.ts";
import { getPlexPlaces } from "#server/plex/catalog.ts";
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

/** Who asked for which season; a series-wide request belongs to no season. */
function bySeason(
  requesters: { name: string; seasonNumber: number | null }[],
): Map<number, string[]> {
  const grouped = new Map<number, string[]>();
  for (const requester of requesters) {
    if (requester.seasonNumber === null) continue;
    grouped.set(requester.seasonNumber, [
      ...(grouped.get(requester.seasonNumber) ?? []),
      requester.name,
    ]);
  }
  return grouped;
}

/**
 * What the service holds of this title, or nothing when it holds none. Asked of
 * the service directly rather than the cached index, so a service being down
 * can be said out loud instead of reading as "not in the library".
 */
async function heldState(
  mediaType: LibraryMediaType,
  tmdbId: number,
  seasonRequesters: Map<number, string[]>,
  plex: PlexPlace,
): Promise<Held | undefined> {
  if (mediaType === "movie") {
    const movie = await radarr.getLibraryMovieByTmdbId(tmdbId);
    return movie ? { state: movieState(movie) } : undefined;
  }

  // Sonarr cannot look a series up by TMDB id, so its own listing is the index.
  const series = (await sonarr.getAllSeries()).find((show) => show.tmdbId === tmdbId);
  if (!series) return undefined;

  const [episodes, queues] = await Promise.all([
    sonarr.getEpisodes(series.id),
    queueStatusBySeason(series.id),
  ]);
  const context: SeasonContext = { requestedBy: seasonRequesters, queues, plex };

  return { state: seriesState(series), seasons: buildSeasons(series, episodes, context) };
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
  const [requesters, places] = await Promise.all([
    getRequestersForMedia(mediaType, tmdbId),
    getPlexPlaces(),
  ]);
  const plex = placeOf(places, { mediaType, tmdbId });

  const [description, held, watchers] = await Promise.all([
    describe(mediaType, tmdbId),
    heldState(mediaType, tmdbId, bySeason(requesters), plex).catch((error) => {
      log.warn("library state unavailable", {
        source: serviceName(mediaType),
        tmdbId,
        error: errorMessage(error),
      });
      return null;
    }),
    getWatchers(),
  ]);

  const library = held?.state;
  const download = library ? await queueStatusFor(mediaType, library.serviceId) : undefined;
  const key = watchKey(mediaType, tmdbId);

  return {
    mediaType,
    tmdbId,
    ...description,
    library,
    seasons: held?.seasons && withEpisodeWatchers(held.seasons, key, watchers),
    progress: download?.progress,
    eta: download?.eta,
    plexUrl: places?.get(key),
    requestedBy: [...new Set(requesters.map((requester) => requester.name))],
    requestedByMe: requesters.some((requester) => requester.userId === viewerId),
    watchedBy: watchers.get(key) ?? [],
    unavailable: held === null ? [serviceName(mediaType)] : [],
  };
}
