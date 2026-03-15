import { sql } from "drizzle-orm";
import { createLogger } from "../logger.ts";
import { db } from "./index.ts";
import type { MediaEventData } from "./media-events.ts";

const log = createLogger("subscriptions");

export interface UserSubscription {
  mediaType: "movie" | "series";
  title: string;
  serviceId: number;
  seasonNumber?: number;
  episodeNumber?: number;
  active: boolean;
  subscribedAt: string;
}

/**
 * Upsert a movie subscription. Re-activates if previously deactivated.
 */
export async function upsertMovieSubscription(
  userId: string,
  radarrId: number,
  conversationId: string,
): Promise<void> {
  await db.execute(sql`
    INSERT INTO movie_subscriptions (user_id, radarr_id, conversation_id, active)
    VALUES (${userId}, ${radarrId}, ${conversationId}, true)
    ON CONFLICT (user_id, radarr_id)
    DO UPDATE SET conversation_id = EXCLUDED.conversation_id, active = true, updated_at = NOW()
  `);
  log.info("upserted movie subscription", { userId, radarrId, conversationId });
}

/**
 * Upsert a series subscription at the appropriate scope.
 */
export async function upsertSeriesSubscription(
  userId: string,
  sonarrId: number,
  conversationId: string,
  seasonNumber?: number,
  episodeNumber?: number,
): Promise<void> {
  if (seasonNumber === undefined) {
    await db.execute(sql`
      INSERT INTO series_subscriptions (user_id, sonarr_id, conversation_id, active)
      VALUES (${userId}, ${sonarrId}, ${conversationId}, true)
      ON CONFLICT (user_id, sonarr_id) WHERE season_number IS NULL AND episode_number IS NULL
      DO UPDATE SET conversation_id = EXCLUDED.conversation_id, active = true, updated_at = NOW()
    `);
  } else if (episodeNumber === undefined) {
    await db.execute(sql`
      INSERT INTO series_subscriptions (user_id, sonarr_id, season_number, conversation_id, active)
      VALUES (${userId}, ${sonarrId}, ${seasonNumber}, ${conversationId}, true)
      ON CONFLICT (user_id, sonarr_id, season_number) WHERE season_number IS NOT NULL AND episode_number IS NULL
      DO UPDATE SET conversation_id = EXCLUDED.conversation_id, active = true, updated_at = NOW()
    `);
  } else {
    await db.execute(sql`
      INSERT INTO series_subscriptions (user_id, sonarr_id, season_number, episode_number, conversation_id, active)
      VALUES (${userId}, ${sonarrId}, ${seasonNumber}, ${episodeNumber}, ${conversationId}, true)
      ON CONFLICT (user_id, sonarr_id, season_number, episode_number) WHERE season_number IS NOT NULL AND episode_number IS NOT NULL
      DO UPDATE SET conversation_id = EXCLUDED.conversation_id, active = true, updated_at = NOW()
    `);
  }
  log.info("upserted series subscription", {
    userId,
    sonarrId,
    seasonNumber,
    episodeNumber,
    conversationId,
  });
}

/**
 * Deactivate a movie subscription.
 */
export async function deactivateMovieSubscription(
  userId: string,
  radarrId: number,
): Promise<number> {
  const result = await db.execute<{ id: string }>(sql`
    UPDATE movie_subscriptions
    SET active = false, updated_at = NOW()
    WHERE user_id = ${userId} AND radarr_id = ${radarrId} AND active = true
    RETURNING id
  `);
  const count = result.length;
  if (count > 0) {
    log.info("deactivated movie subscription", { userId, radarrId, count });
  }
  return count;
}

/**
 * Deactivate series subscriptions at the given scope and narrower.
 * - No seasonNumber: deactivates all subscriptions for the series
 * - With seasonNumber: deactivates the season sub + episode subs within that season
 */
export async function deactivateSeriesSubscriptions(
  userId: string,
  sonarrId: number,
  seasonNumber?: number,
): Promise<number> {
  let result: { id: string }[];
  if (seasonNumber === undefined) {
    result = await db.execute<{ id: string }>(sql`
      UPDATE series_subscriptions
      SET active = false, updated_at = NOW()
      WHERE user_id = ${userId} AND sonarr_id = ${sonarrId} AND active = true
      RETURNING id
    `);
  } else {
    result = await db.execute<{ id: string }>(sql`
      UPDATE series_subscriptions
      SET active = false, updated_at = NOW()
      WHERE user_id = ${userId} AND sonarr_id = ${sonarrId}
        AND season_number = ${seasonNumber} AND active = true
      RETURNING id
    `);
  }
  const count = result.length;
  if (count > 0) {
    log.info("deactivated series subscriptions", { userId, sonarrId, seasonNumber, count });
  }
  return count;
}

/**
 * Get all subscriptions for a user (both active and inactive).
 */
export async function getSubscriptionsForUser(userId: string): Promise<UserSubscription[]> {
  const movies = await db.execute<{
    title: string;
    radarr_id: number;
    active: boolean;
    created_at: string;
  }>(sql`
    SELECT
      COALESCE(
        (SELECT me.title FROM media_events me
         WHERE me.user_id = ms.user_id
           AND (me.ids->>'radarr')::int = ms.radarr_id
           AND me.action = 'add'
         ORDER BY me.created_at DESC LIMIT 1),
        'Unknown'
      ) as title,
      ms.radarr_id,
      ms.active,
      ms.created_at
    FROM movie_subscriptions ms
    WHERE ms.user_id = ${userId}
    ORDER BY ms.created_at DESC
  `);

  const series = await db.execute<{
    title: string;
    sonarr_id: number;
    season_number: number | null;
    episode_number: number | null;
    active: boolean;
    created_at: string;
  }>(sql`
    SELECT
      COALESCE(
        (SELECT me.title FROM media_events me
         WHERE me.user_id = ss.user_id
           AND (me.ids->>'sonarr')::int = ss.sonarr_id
           AND me.action IN ('add', 'download')
         ORDER BY me.created_at DESC LIMIT 1),
        'Unknown'
      ) as title,
      ss.sonarr_id,
      ss.season_number,
      ss.episode_number,
      ss.active,
      ss.created_at
    FROM series_subscriptions ss
    WHERE ss.user_id = ${userId}
    ORDER BY ss.created_at DESC
  `);

  return [
    ...movies.map((r) => ({
      mediaType: "movie" as const,
      title: r.title,
      serviceId: r.radarr_id,
      active: r.active,
      subscribedAt: r.created_at,
    })),
    ...series.map((r) => ({
      mediaType: "series" as const,
      title: r.title,
      serviceId: r.sonarr_id,
      seasonNumber: r.season_number ?? undefined,
      episodeNumber: r.episode_number ?? undefined,
      active: r.active,
      subscribedAt: r.created_at,
    })),
  ];
}

/**
 * Process a media event to create/update/deactivate subscriptions.
 * Skips when userId is null (e.g., unauthenticated chat handler).
 * Non-fatal — logs errors but doesn't throw.
 */
export async function processMediaEvent(
  event: MediaEventData,
  conversationId: string,
  userId: string | null,
): Promise<void> {
  if (!userId) return;

  try {
    switch (event.action) {
      case "add":
        if (event.mediaType === "movie" && event.ids.radarr) {
          await upsertMovieSubscription(userId, event.ids.radarr, conversationId);
        } else if (event.mediaType === "series" && event.ids.sonarr) {
          await upsertSeriesSubscription(userId, event.ids.sonarr, conversationId);
        }
        break;

      case "download":
        if (event.mediaType === "series" && event.ids.sonarr) {
          await upsertSeriesSubscription(
            userId,
            event.ids.sonarr,
            conversationId,
            event.seasonNumber,
          );
        }
        break;

      case "remove":
        if (event.mediaType === "movie" && event.ids.radarr) {
          await deactivateMovieSubscription(userId, event.ids.radarr);
        } else if (event.mediaType === "series" && event.ids.sonarr) {
          await deactivateSeriesSubscriptions(userId, event.ids.sonarr, event.seasonNumber);
        }
        break;
    }
  } catch (error) {
    log.error("failed to process media event subscription", {
      action: event.action,
      mediaType: event.mediaType,
      title: event.title,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
