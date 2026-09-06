import type { EpisodeSummary, SeasonSummary } from "#shared/types.ts";
import type { SonarrEpisode, SonarrSeries } from "#server/sonarr/types.ts";

/** Sonarr files specials under season 0, which nobody thinks of as the first one. */
const SPECIALS = 0;

function toEpisode(episode: SonarrEpisode): EpisodeSummary {
  return {
    episodeNumber: episode.episodeNumber,
    title: episode.title,
    airDate: episode.airDateUtc ?? episode.airDate,
    hasFile: episode.hasFile,
    monitored: episode.monitored,
  };
}

function byNumber(a: { seasonNumber: number }, b: { seasonNumber: number }): number {
  if (a.seasonNumber === SPECIALS) return 1;
  if (b.seasonNumber === SPECIALS) return -1;
  return a.seasonNumber - b.seasonNumber;
}

/**
 * The series' seasons with their episodes attached. Sonarr counts each season
 * separately, so the totals come from it rather than from counting episodes —
 * the two disagree on anything not yet aired.
 */
export function buildSeasons(series: SonarrSeries, episodes: SonarrEpisode[]): SeasonSummary[] {
  const bySeason = new Map<number, EpisodeSummary[]>();
  for (const episode of episodes) {
    const list = bySeason.get(episode.seasonNumber) ?? [];
    list.push(toEpisode(episode));
    bySeason.set(episode.seasonNumber, list);
  }

  return (series.seasons ?? [])
    .map((season) => ({
      seasonNumber: season.seasonNumber,
      monitored: season.monitored,
      episodeCount: season.statistics?.episodeCount ?? 0,
      episodeFileCount: season.statistics?.episodeFileCount ?? 0,
      sizeOnDisk: season.statistics?.sizeOnDisk ?? 0,
      episodes: (bySeason.get(season.seasonNumber) ?? []).sort(
        (a, b) => a.episodeNumber - b.episodeNumber,
      ),
    }))
    .sort(byNumber);
}
