/** Formatting shared by the server and the thread viewer so both read identically. */

export interface EpisodeRef {
  seasonNumber: number;
  episodeNumber: number;
  title?: string;
}

/** "S01E02" */
export function episodeCode(seasonNumber: number, episodeNumber: number): string {
  return `S${String(seasonNumber).padStart(2, "0")}E${String(episodeNumber).padStart(2, "0")}`;
}

/** "S01E02 Good News", falling back to whichever part is known. */
export function episodeLabel(
  seasonNumber?: number,
  episodeNumber?: number,
  title?: string,
): string {
  if (seasonNumber === undefined || episodeNumber === undefined) return title ?? "—";
  const code = episodeCode(seasonNumber, episodeNumber);
  return title ? `${code} ${title}` : code;
}

/** "Season 2", with Sonarr's season 0 called what it is. */
export function seasonName(seasonNumber: number): string {
  return seasonNumber === 0 ? "Specials" : `Season ${seasonNumber}`;
}

/** One episode reads as itself; several read as a count, by season where they share one. */
export function episodesLabel(episodes: EpisodeRef[]): string {
  const only = episodes[0];
  if (episodes.length === 1 && only) {
    return episodeLabel(only.seasonNumber, only.episodeNumber, only.title);
  }

  const seasons = new Set(episodes.map((episode) => episode.seasonNumber));
  const count = `${episodes.length} episodes`;
  const season = [...seasons][0];

  return seasons.size === 1 && season !== undefined ? `${seasonName(season)} · ${count}` : count;
}

/** "Severance (2022)", dropping the year when it is unknown. */
export function titleWithYear(title: string | undefined, year?: number): string {
  if (!title) return "—";
  return year ? `${title} (${year})` : title;
}

/** `S01E01 "Good News", S01E02 "Half Loop"` — the quoted form used in notifications. */
export function quotedEpisodeList(episodes: EpisodeRef[]): string {
  return episodes
    .map((e) => `${episodeCode(e.seasonNumber, e.episodeNumber)} "${e.title ?? ""}"`)
    .join(", ");
}
