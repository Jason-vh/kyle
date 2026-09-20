/** `movie:550` — the two services number their ids independently. */
export function watchKey(mediaType: string, tmdbId: number): string {
  return `${mediaType}:${tmdbId}`;
}

export function titleKey(sectionKey: string, title: string): string {
  return `${sectionKey}:${title.toLowerCase()}`;
}

/** `series:1220:6:10` — one episode of the series `watchKey` names. */
export function episodeWatchKey(
  seriesKey: string,
  seasonNumber: number,
  episodeNumber: number,
): string {
  return `${seriesKey}:${seasonNumber}:${episodeNumber}`;
}
