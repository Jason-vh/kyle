import type { EpisodeSummary, SeasonStatus, SeasonSummary, Watcher } from "#shared/types.ts";
import type { SonarrEpisode, SonarrSeason, SonarrSeries } from "#server/sonarr/types.ts";
import type { QueueStatus } from "#server/requests/queue.ts";
import { seasonEntry } from "#server/requests/library.ts";
import { resolveState } from "#server/requests/state.ts";
import { episodeWatchKey } from "#server/plex/history.ts";

/** Sonarr files specials under season 0, which nobody thinks of as the first one. */
const SPECIALS = 0;

function toEpisode(episode: SonarrEpisode): EpisodeSummary {
  return {
    episodeNumber: episode.episodeNumber,
    title: episode.title,
    airDate: episode.airDateUtc ?? episode.airDate,
    hasFile: episode.hasFile,
    monitored: episode.monitored,
    watchedBy: [],
  };
}

/** Annotates each episode with whoever has played it, leaving the rest alone. */
export function withEpisodeWatchers(
  seasons: SeasonSummary[],
  seriesKey: string,
  watchers: Map<string, Watcher[]>,
): SeasonSummary[] {
  return seasons.map((season) => ({
    ...season,
    episodes: season.episodes.map((episode) => ({
      ...episode,
      watchedBy:
        watchers.get(episodeWatchKey(seriesKey, season.seasonNumber, episode.episodeNumber)) ?? [],
    })),
  }));
}

/** An episode with no date at all has not been scheduled, not aired. */
function hasAired(episode: EpisodeSummary): boolean {
  return !!episode.airDate && new Date(episode.airDate) <= new Date();
}

/** When the next episode of this season arrives, where Sonarr has a date. */
function nextAirDate(episodes: EpisodeSummary[]): string | undefined {
  return episodes.find((episode) => !hasAired(episode))?.airDate;
}

/**
 * Where one season stands. A season is asked the same questions as the title
 * around it, with two answers only a season can give: nobody has asked for it,
 * or it is on air and up to date, which is not the same as finished.
 */
function statusOf(
  series: SonarrSeries,
  season: SonarrSeason,
  episodes: EpisodeSummary[],
  requestedBy: string[],
  queue: QueueStatus | undefined,
): SeasonStatus {
  const entry = seasonEntry(series, season);
  const next = nextAirDate(episodes);

  // Not late, never coming: nothing watches it and nobody asked.
  if (requestedBy.length === 0 && !entry.monitored && !entry.hasFiles) {
    return { state: "unrequested", expectedAt: next };
  }

  const { state, detail, since, expectedAt, progress, eta } = resolveState(entry, queue);

  if (state === "ready" && next) return { state: "airing", expectedAt: next };
  if (state === "unreleased") return { state, expectedAt: next ?? expectedAt };
  return { state, detail, since, progress, eta };
}

function byNumber(a: { seasonNumber: number }, b: { seasonNumber: number }): number {
  if (a.seasonNumber === SPECIALS) return 1;
  if (b.seasonNumber === SPECIALS) return -1;
  return a.seasonNumber - b.seasonNumber;
}

/** What the services know about a season beyond Sonarr's own numbers. */
export interface SeasonContext {
  /** Who asked for each season, by season number. */
  requestedBy: Map<number, string[]>;
  /** What each season's queue is doing, by season number. */
  queues: Map<number, QueueStatus>;
}

/**
 * The series' seasons with their episodes attached. Sonarr counts each season
 * separately, so the totals come from it rather than from counting episodes —
 * the two disagree on anything not yet aired.
 */
export function buildSeasons(
  series: SonarrSeries,
  episodes: SonarrEpisode[],
  context: SeasonContext,
): SeasonSummary[] {
  const bySeason = new Map<number, EpisodeSummary[]>();
  for (const episode of episodes) {
    const list = bySeason.get(episode.seasonNumber) ?? [];
    list.push(toEpisode(episode));
    bySeason.set(episode.seasonNumber, list);
  }

  return (series.seasons ?? [])
    .map((season) => {
      const seasonEpisodes = (bySeason.get(season.seasonNumber) ?? []).sort(
        (a, b) => a.episodeNumber - b.episodeNumber,
      );
      const requestedBy = context.requestedBy.get(season.seasonNumber) ?? [];

      return {
        seasonNumber: season.seasonNumber,
        monitored: season.monitored,
        episodeCount: season.statistics?.episodeCount ?? 0,
        episodeFileCount: season.statistics?.episodeFileCount ?? 0,
        sizeOnDisk: season.statistics?.sizeOnDisk ?? 0,
        episodes: seasonEpisodes,
        requestedBy,
        ...statusOf(
          series,
          season,
          seasonEpisodes,
          requestedBy,
          context.queues.get(season.seasonNumber),
        ),
      };
    })
    .sort(byNumber);
}
