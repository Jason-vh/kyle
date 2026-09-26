import type { ActivityItem } from "#shared/types.ts";
import type { SonarrEpisode, SonarrHistoryItem, SonarrSeries } from "#server/sonarr/types.ts";
import * as radarr from "#server/radarr/api.ts";
import * as sonarr from "#server/sonarr/api.ts";
import { getAllRequesters } from "#server/db/requests.ts";
import { annotateRequesters } from "#server/requests/requesters.ts";
import { getPlexAvatars } from "#server/plex/access.ts";
import { posterOf } from "#server/media-images.ts";
import { episodesLabel } from "#shared/media.ts";
import { createLogger } from "#server/logger.ts";
import { errorMessage } from "#server/errors.ts";

const log = createLogger("dashboard-activity");

/** History is noisy — grabs, failures, renames — and only an import means it landed. */
const IMPORTED = "downloadFolderImported";

/** Enough history to cover a busy week without paging. */
const HISTORY_PAGE = 60;

/** Episodes are grouped under the series they belong to, by whatever names it. */
function seriesKey(series: SonarrSeries): string {
  return series.tmdbId ? `tmdb-${series.tmdbId}` : `title-${series.title}`;
}

/**
 * The episodes of one series that landed, newest import first. Sonarr writes a
 * row per episode, and another when one is upgraded, so each is counted once.
 */
interface SeriesLanding {
  newest: SonarrHistoryItem;
  episodes: Map<number, SonarrEpisode>;
}

/** One service being down costs its half of the feed, not the whole page. */
async function settle<T>(name: string, load: () => Promise<T>): Promise<T | undefined> {
  try {
    return await load();
  } catch (error) {
    log.warn("activity source unavailable", { source: name, error: errorMessage(error) });
    return undefined;
  }
}

/**
 * What has landed in the library recently, newest first, with whoever asked
 * for it named. Sourced from Radarr's and Sonarr's own history rather than
 * Plex, because only they know the title behind a file.
 */
export async function getActivity(viewerId: string, since: Date): Promise<ActivityItem[]> {
  const [movies, series, requesters, avatars] = await Promise.all([
    settle("Radarr", () => radarr.getHistory(HISTORY_PAGE)),
    settle("Sonarr", () => sonarr.getHistory(1, HISTORY_PAGE)),
    getAllRequesters(),
    getPlexAvatars(),
  ]);

  const items: ActivityItem[] = [];
  const landed = (at: string) => new Date(at) >= since;

  for (const record of movies?.records ?? []) {
    if (record.eventType !== IMPORTED || !record.movie || !landed(record.date)) continue;
    items.push({
      id: `movie-${record.id}`,
      mediaType: "movie",
      title: record.movie.title,
      year: record.movie.year || undefined,
      posterUrl: posterOf(record.movie),
      at: record.date,
      requestedBy: [],
      requestedByMe: false,
      tmdbId: record.movie.tmdbId,
    });
  }

  const landings = new Map<string, SeriesLanding>();

  for (const record of series?.records ?? []) {
    if (record.eventType !== IMPORTED || !record.series || !landed(record.date)) continue;

    const key = seriesKey(record.series);
    const landing = landings.get(key) ?? { newest: record, episodes: new Map() };

    if (record.episode) landing.episodes.set(record.episodeId, record.episode);
    if (record.date > landing.newest.date) landing.newest = record;
    landings.set(key, landing);
  }

  for (const [key, landing] of landings) {
    const { newest, episodes } = landing;
    items.push({
      id: `series-${key}`,
      mediaType: "series",
      title: newest.series.title,
      year: newest.series.year || undefined,
      detail: episodesLabel([...episodes.values()]),
      posterUrl: posterOf(newest.series),
      at: newest.date,
      requestedBy: [],
      requestedByMe: false,
      tmdbId: newest.series.tmdbId,
    });
  }

  annotateRequesters(items, viewerId, requesters, avatars);

  const recent = items.sort((a, b) => b.at.localeCompare(a.at));

  log.info("built activity feed", { since: since.toISOString(), items: recent.length });

  return recent;
}
