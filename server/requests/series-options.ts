import type { SeasonOption, SeriesRequestOptions } from "#shared/types.ts";
import type { SonarrSeries } from "#server/sonarr/types.ts";
import type { TMDBTVSeason } from "#server/tmdb/types.ts";
import * as sonarr from "#server/sonarr/api.ts";
import * as tmdb from "#server/tmdb/api.ts";
import { yearOf } from "#server/tmdb/utils.ts";
import { isContinuing, MediaNotFoundError } from "./service.ts";
import { createLogger } from "#server/logger.ts";
import { errorMessage } from "#server/errors.ts";

const log = createLogger("series-options");

/**
 * Sonarr's seasons, since those are what a request is made in, annotated with
 * what TMDB knows of each. The two number seasons independently, so a season
 * TMDB has no match for simply goes without.
 */
export function seasonOptions(series: SonarrSeries, tmdbSeasons: TMDBTVSeason[]): SeasonOption[] {
  const byNumber = new Map(tmdbSeasons.map((season) => [season.season_number, season]));

  const options = (series.seasons ?? []).map((season): SeasonOption => {
    const known = byNumber.get(season.seasonNumber);
    return {
      seasonNumber: season.seasonNumber,
      episodeCount: known?.episode_count || undefined,
      year: yearOf(known?.air_date),
    };
  });

  const regular = options
    .filter((option) => option.seasonNumber > 0)
    .sort((a, b) => a.seasonNumber - b.seasonNumber);
  const specials = options.filter((option) => option.seasonNumber === 0);
  return [...regular, ...specials];
}

/** What can be chosen when requesting a series. Sonarr is required; TMDB only adds detail. */
export async function getSeriesRequestOptions(tmdbId: number): Promise<SeriesRequestOptions> {
  const [[lookup], show] = await Promise.all([
    sonarr.searchSeries(`tmdb:${tmdbId}`),
    tmdb.getTVShow(tmdbId).catch((error) => {
      log.warn("tmdb seasons unavailable", { tmdbId, error: errorMessage(error) });
      return undefined;
    }),
  ]);
  if (!lookup?.tvdbId) throw new MediaNotFoundError("series", `tmdb:${tmdbId}`);

  return {
    seasons: seasonOptions(lookup, show?.seasons ?? []),
    continuing: isContinuing(lookup),
  };
}
