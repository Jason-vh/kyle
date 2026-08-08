import { createLogger } from "../logger.ts";
import { errorMessage } from "../errors.ts";
import { episodeCode } from "../../shared/media.ts";
import { findMediaRequesters } from "./requester.ts";
import { notifyRequesters } from "./notify.ts";
import type { MediaNotificationInfo } from "./types.ts";

const log = createLogger("webhooks:batch");

/** A season lands as one webhook per episode; wait for the rest before speaking up. */
const BATCH_DELAY_MS = 600_000;

const pending = new Map<number, MediaNotificationInfo>();

type Episode = NonNullable<MediaNotificationInfo["episodes"]>[number];

function describeEpisodes(episodes: Episode[]): string {
  return episodes.map((e) => episodeCode(e.seasonNumber, e.episodeNumber)).join(", ");
}

async function flush(sonarrId: number): Promise<void> {
  const media = pending.get(sonarrId);
  if (!media) return;
  pending.delete(sonarrId);

  const requesters = await findMediaRequesters("series", { sonarr: sonarrId }, media.episodes);
  await notifyRequesters(requesters, media);
}

/**
 * Collects episodes of one series until the window closes, then notifies once.
 * Later episodes join the batch already in flight rather than starting a new one.
 */
export function batchSeriesNotification(sonarrId: number, media: MediaNotificationInfo): void {
  const episodes = media.episodes ?? [];
  const existing = pending.get(sonarrId);

  if (existing) {
    const known = (existing.episodes ??= []);
    for (const episode of episodes) {
      const duplicate = known.some(
        (e) => e.seasonNumber === episode.seasonNumber && e.episodeNumber === episode.episodeNumber,
      );
      if (!duplicate) known.push(episode);
    }
    log.info("batching episode", {
      title: media.title,
      episode: describeEpisodes(episodes),
      batchSize: known.length,
    });
    return;
  }

  setTimeout(() => {
    flush(sonarrId).catch((error) => {
      log.error("batched notification failed", { title: media.title, error: errorMessage(error) });
    });
  }, BATCH_DELAY_MS);

  pending.set(sonarrId, media);
  log.info("batch started", {
    title: media.title,
    episode: describeEpisodes(episodes),
    delayMs: BATCH_DELAY_MS,
  });
}
