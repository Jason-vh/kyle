import type { SeasonOption } from "#shared/types";
import { seasonName } from "#shared/media";

/** What someone asked of a series: the seasons wanted now, and whether to follow it. */
export interface SeriesChoice {
  seasons: number[];
  follow: boolean;
}

/** Every season but the specials, which nobody means by "the series". */
export function regularSeasons(options: SeasonOption[]): number[] {
  return options.map((option) => option.seasonNumber).filter((season) => season > 0);
}

/** The newest regular season, where one exists. */
export function latestSeason(options: SeasonOption[]): number[] {
  const regular = regularSeasons(options);
  return regular.length ? [Math.max(...regular)] : [];
}

/** "9 episodes · 2022", leaving out whatever TMDB did not say. */
export function seasonDetail(option: SeasonOption): string {
  const parts: string[] = [];
  if (option.episodeCount) parts.push(`${option.episodeCount} episodes`);
  if (option.year) parts.push(String(option.year));
  return parts.join(" · ");
}

/** What the confirm button says, which is also what it will do. */
export function choiceLabel(seasons: number[], follow: boolean): string {
  const [only] = seasons;
  if (seasons.length === 0) return follow ? "Follow only" : "Choose a season";
  if (seasons.length === 1 && only !== undefined) return `Request ${seasonName(only)}`;
  return `Request ${seasons.length} seasons`;
}

/** Nothing chosen and nothing followed would add a series nobody wants anything of. */
export function isEmptyChoice(seasons: number[], follow: boolean): boolean {
  return seasons.length === 0 && !follow;
}
