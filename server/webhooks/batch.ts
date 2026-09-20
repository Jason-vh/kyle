import type { MediaNotificationInfo } from "./types.ts";

export const BATCH_DELAY_MS = 600_000;

export function mergeMedia(
  existing: MediaNotificationInfo,
  incoming: MediaNotificationInfo,
): MediaNotificationInfo {
  const episodes = new Map(
    (existing.episodes ?? []).map((episode) => [
      `${episode.seasonNumber}:${episode.episodeNumber}`,
      episode,
    ]),
  );
  for (const episode of incoming.episodes ?? []) {
    episodes.set(`${episode.seasonNumber}:${episode.episodeNumber}`, episode);
  }
  return { ...existing, episodes: [...episodes.values()] };
}
