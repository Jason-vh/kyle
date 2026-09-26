import type {
  LibraryMediaType,
  LibraryState,
  MediaDetail,
  MovieReleases,
  SeasonSummary,
  TitleStatus,
} from "#shared/types.ts";
import * as radarr from "#server/radarr/api.ts";
import * as sonarr from "#server/sonarr/api.ts";
import { isContinuing, isFollowing } from "#server/sonarr/utils.ts";
import * as tmdb from "#server/tmdb/api.ts";
import { earliestReleases, yearOf } from "#server/tmdb/utils.ts";
import type { RadarrMovie } from "#server/radarr/types.ts";
import { movieState, seriesState } from "#server/library/item.ts";
import { movieEntry, seriesEntry, type LibraryEntry } from "#server/requests/library.ts";
import { buildSeasons, withEpisodeWatchers, type SeasonContext } from "./seasons.ts";
import {
  placeOf,
  queueStatusBySeason,
  queueStatusFor,
  resolveState,
  type PlexPlace,
} from "#server/requests/state.ts";
import type { QueueStatus } from "#server/requests/queue.ts";
import { getRequestersForMedia } from "#server/db/requests.ts";
import { getRemoval } from "#server/db/removals.ts";
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
  | "releases"
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
      releases: releasesOf(earliestReleases(movie)),
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
  };
}

function releasesOf(releases: ReturnType<typeof earliestReleases>): MovieReleases {
  return {
    cinema: releases.cinema ?? undefined,
    digital: releases.digital ?? undefined,
    physical: releases.physical ?? undefined,
  };
}

/** "4K" rather than "2160p", since that is what a television box says. */
export function resolutionLabel(resolution: number | undefined): string | undefined {
  if (!resolution) return undefined;
  return resolution >= 2160 ? "4K" : `${resolution}p`;
}

interface Held {
  state: LibraryState;
  /** The same title as a request sees it, so both can be worded alike. */
  entry: LibraryEntry;
  seasons?: SeasonSummary[];
  following?: boolean;
  continuing?: boolean;
  quality?: string;
}

function heldMovie(movie: RadarrMovie): Held {
  return {
    state: movieState(movie),
    entry: movieEntry(movie),
    quality: resolutionLabel(movie.movieFile?.quality.quality.resolution),
  };
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
    return movie ? heldMovie(movie) : undefined;
  }

  // Sonarr cannot look a series up by TMDB id, so its own listing is the index.
  const series = (await sonarr.getAllSeries()).find((show) => show.tmdbId === tmdbId);
  if (!series) return undefined;

  const [episodes, queues] = await Promise.all([
    sonarr.getEpisodes(series.id),
    queueStatusBySeason(series.id),
  ]);
  const context: SeasonContext = { requestedBy: seasonRequesters, queues, plex };

  return {
    state: seriesState(series),
    entry: seriesEntry(series),
    seasons: buildSeasons(series, episodes, context),
    following: isFollowing(series),
    continuing: isContinuing(series),
  };
}

export function serviceName(mediaType: LibraryMediaType): string {
  return mediaType === "movie" ? "Radarr" : "Sonarr";
}

/**
 * Where the title stands. A service that cannot be reached says nothing, which
 * is not the same as not holding it; a title not held is either one somebody
 * removed, or one nobody has asked for.
 */
async function statusOf(
  mediaType: LibraryMediaType,
  tmdbId: number,
  held: Held | undefined | null,
  queue: QueueStatus | undefined,
  plex: PlexPlace,
): Promise<TitleStatus | undefined> {
  if (held === null) return { state: "unknown" };

  if (!held) {
    const removal = await getRemoval(mediaType, tmdbId);
    return removal ? resolveState({ removal }) : undefined;
  }

  const { state, detail, since, expectedAt, missing } = resolveState({
    entry: held.entry,
    queue,
    plex,
  });
  return { state, detail, since, expectedAt, missing };
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
  const status = await statusOf(mediaType, tmdbId, held, download, plex);
  const key = watchKey(mediaType, tmdbId);

  return {
    mediaType,
    tmdbId,
    ...description,
    status,
    library,
    quality: held?.quality,
    seasons: held?.seasons && withEpisodeWatchers(held.seasons, key, watchers),
    following: held?.following,
    continuing: held?.continuing,
    progress: download?.progress,
    eta: download?.eta,
    plexUrl: places?.get(key),
    requestedBy: [...new Set(requesters.map((requester) => requester.name))],
    requestedByMe: requesters.some((requester) => requester.userId === viewerId),
    watchedBy: watchers.get(key) ?? [],
    unavailable: held === null ? [serviceName(mediaType)] : [],
  };
}
