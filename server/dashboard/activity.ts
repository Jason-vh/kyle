import type { ActivityItem } from "#shared/types.ts";
import * as radarr from "#server/radarr/api.ts";
import * as sonarr from "#server/sonarr/api.ts";
import { getAllRequesters } from "#server/db/requests.ts";
import { annotateRequesters } from "#server/requests/requesters.ts";
import { posterOf } from "#server/media-images.ts";
import { episodeLabel } from "#shared/media.ts";
import { createLogger } from "#server/logger.ts";
import { errorMessage } from "#server/errors.ts";

const log = createLogger("dashboard-activity");

/** History is noisy — grabs, failures, renames — and only an import means it landed. */
const IMPORTED = "downloadFolderImported";

/** Enough history to cover a busy week without paging. */
const HISTORY_PAGE = 60;

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
  const [movies, series, requesters] = await Promise.all([
    settle("Radarr", () => radarr.getHistory(HISTORY_PAGE)),
    settle("Sonarr", () => sonarr.getHistory(1, HISTORY_PAGE)),
    getAllRequesters(),
  ]);

  const items: ActivityItem[] = [];

  for (const record of movies?.records ?? []) {
    if (record.eventType !== IMPORTED || !record.movie) continue;
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

  for (const record of series?.records ?? []) {
    if (record.eventType !== IMPORTED || !record.series) continue;
    items.push({
      id: `series-${record.id}`,
      mediaType: "series",
      title: record.series.title,
      year: record.series.year || undefined,
      detail: episodeLabel(
        record.episode?.seasonNumber,
        record.episode?.episodeNumber,
        record.episode?.title,
      ),
      posterUrl: posterOf(record.series),
      at: record.date,
      requestedBy: [],
      requestedByMe: false,
      tmdbId: record.series.tmdbId,
    });
  }

  annotateRequesters(items, viewerId, requesters);

  const recent = items
    .filter((item) => new Date(item.at) >= since)
    .sort((a, b) => b.at.localeCompare(a.at));

  log.info("built activity feed", { since: since.toISOString(), items: recent.length });

  return recent;
}
