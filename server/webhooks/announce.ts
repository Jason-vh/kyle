import { createLogger } from "#server/logger.ts";
import { errorMessage } from "#server/errors.ts";
import { quotedEpisodeList, titleWithYear } from "#shared/media.ts";
import { saveNotifications, type NewNotification } from "#server/db/notifications.ts";
import { describeMedia, notifyRequesters } from "./notify.ts";
import { findMediaRequesters, findSubscribedUserIds } from "./requester.ts";
import type { MediaNotificationInfo } from "./types.ts";

const log = createLogger("webhooks:announce");

/**
 * What the app notification says. Deterministic on purpose: the chat reply is
 * worth a model's phrasing because it continues a conversation, and this is not.
 */
export function notificationFor(
  media: MediaNotificationInfo,
  ids: { radarr?: number; sonarr?: number; tmdb?: number },
): NewNotification {
  const episodes = media.mediaType === "series" ? media.episodes : undefined;

  return {
    mediaType: media.mediaType,
    title: titleWithYear(media.title, media.year),
    body: episodes?.length
      ? `${quotedEpisodeList(episodes)} is ready to watch.`
      : "It is ready to watch.",
    tmdbId: ids.tmdb,
    serviceId: ids.radarr ?? ids.sonarr,
  };
}

export interface Announcement {
  /** People told in the app. */
  notified: number;
  /** Conversations replied to, which only chat requesters have. */
  posted: number;
}

/**
 * Tell everyone who asked for this media that it has arrived.
 *
 * Everyone gets it in the app, which is the only place a browser request can be
 * answered. Anyone who asked in Slack or Discord additionally gets a reply in
 * the thread they asked in, written by the agent.
 */
export async function announce(
  ids: { radarr?: number; sonarr?: number; tmdb?: number },
  media: MediaNotificationInfo,
): Promise<Announcement> {
  const [userIds, requesters] = await Promise.all([
    findSubscribedUserIds(media.mediaType, ids, media.episodes),
    findMediaRequesters(media.mediaType, ids, media.episodes),
  ]);

  const notified = await saveNotifications(userIds, notificationFor(media, ids));

  // A failed chat reply must not lose the in-app notification already recorded.
  try {
    await notifyRequesters(requesters, media);
  } catch (error) {
    log.error("could not reply in chat", {
      title: describeMedia(media),
      error: errorMessage(error),
    });
  }

  log.info("announced media", { title: describeMedia(media), notified, posted: requesters.length });
  return { notified, posted: requesters.length };
}
