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
