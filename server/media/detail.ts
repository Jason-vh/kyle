import type {
  LibraryMediaType,
  LibraryState,
  MediaDetail,
  SeasonSummary,
  TitleStatus,
} from "#shared/types.ts";
import * as radarr from "#server/radarr/api.ts";
import * as sonarr from "#server/sonarr/api.ts";
import { isContinuing, isFollowing } from "#server/sonarr/utils.ts";
import { describe } from "./description.ts";
import type { RadarrMovie } from "#server/radarr/types.ts";
import type { SonarrEpisode, SonarrSeries } from "#server/sonarr/types.ts";
import { movieState, seriesState } from "#server/library/item.ts";
import { movieEntry, seriesEntry, type LibraryEntry } from "#server/requests/library.ts";
import { buildSeasons, withEpisodeWatchers, type SeasonContext } from "./seasons.ts";
import {
  placeOf,
  resolveState,
  titleQueue,
  type PlexPlace,
  type TitleQueue,
} from "#server/requests/state.ts";
import type { QueueStatus } from "#server/requests/queue.ts";
import { getRequestersForMedia } from "#server/db/requests.ts";
import { getRemoval, type Removal } from "#server/db/removals.ts";
import { getWatchers, watchKey } from "#server/plex/history.ts";
import { getPlexPlaces } from "#server/plex/catalog.ts";
import { watchersFor, type Viewer } from "#server/people.ts";
import { createLogger } from "#server/logger.ts";
import { errorMessage } from "#server/errors.ts";

const log = createLogger("media-detail");

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

type Stored =
  | { mediaType: "movie"; movie: RadarrMovie; queue: TitleQueue }
  | { mediaType: "series"; series: SonarrSeries; episodes: SonarrEpisode[]; queue: TitleQueue };

/**
 * What the service holds of this title, or nothing when it holds none. Asked of
 * the service directly rather than the cached index, so a service being down
 * can be said out loud instead of reading as "not in the library".
 */
async function fetchStored(
  mediaType: LibraryMediaType,
  tmdbId: number,
): Promise<Stored | undefined> {
  if (mediaType === "movie") {
    const movie = await radarr.getLibraryMovieByTmdbId(tmdbId);
    if (!movie) return undefined;
    return { mediaType, movie, queue: await titleQueue(mediaType, movie.id) };
  }

  // Sonarr cannot look a series up by TMDB id, so its own listing is the index.
  const series = (await sonarr.getAllSeries()).find((show) => show.tmdbId === tmdbId);
  if (!series) return undefined;

  const [episodes, queue] = await Promise.all([
    sonarr.getEpisodes(series.id),
    titleQueue(mediaType, series.id),
  ]);
  return { mediaType, series, episodes, queue };
}

function heldFrom(stored: Stored, seasonRequesters: Map<number, string[]>, plex: PlexPlace): Held {
  if (stored.mediaType === "movie") return heldMovie(stored.movie);

  const { series, episodes, queue } = stored;
  const context: SeasonContext = {
    requestedBy: seasonRequesters,
    queues: queue.seasons,
    episodeQueues: queue.episodes,
    plex,
  };
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
function statusOf(
  held: Held | undefined | null,
  queue: QueueStatus | undefined,
  removal: Removal | undefined,
  plex: PlexPlace,
  viewer: Viewer,
): TitleStatus | undefined {
  if (held === null) return { state: "unknown" };

  if (!held) return removal ? resolveState({ removal, viewer }) : undefined;

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
  viewer: Viewer,
): Promise<MediaDetail> {
  const [description, stored, requesters, places, watchers, removal] = await Promise.all([
    describe(mediaType, tmdbId),
    fetchStored(mediaType, tmdbId).catch((error) => {
      log.warn("library state unavailable", {
        source: serviceName(mediaType),
        tmdbId,
        error: errorMessage(error),
      });
      return null;
    }),
    getRequestersForMedia(mediaType, tmdbId),
    getPlexPlaces(),
    getWatchers(),
    getRemoval(mediaType, tmdbId),
  ]);

  const plex = placeOf(places, { mediaType, tmdbId });
  const held = stored && heldFrom(stored, bySeason(requesters), plex);
  const download = stored?.queue.title;
  const status = statusOf(held, download, removal, plex, viewer);
  const key = watchKey(mediaType, tmdbId);
  const watchersOf = (watchKey: string) => watchersFor(watchers.get(watchKey) ?? [], viewer);

  return {
    mediaType,
    tmdbId,
    ...description,
    status,
    library: held?.state,
    quality: held?.quality,
    seasons: held?.seasons && withEpisodeWatchers(held.seasons, key, watchersOf),
    following: held?.following,
    continuing: held?.continuing,
    progress: download?.progress,
    eta: download?.eta,
    plexUrl: places?.get(key),
    requestedBy: [...new Set(requesters.map((requester) => requester.name))],
    requestedByMe: requesters.some((requester) => requester.userId === viewer.userId),
    watchedBy: watchersOf(key),
    unavailable: held === null ? [serviceName(mediaType)] : [],
  };
}
