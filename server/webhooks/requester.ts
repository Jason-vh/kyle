import { sql } from "drizzle-orm";
import { createLogger } from "../logger.ts";
import { db } from "../db/index.ts";
import type { MediaRequester } from "./types.ts";

const log = createLogger("webhooks:requester");

/**
 * Find conversations where a media item was requested, so we can notify the requester.
 * Queries subscription tables (movie_subscriptions / series_subscriptions) joined with
 * conversations to get interface type + channel metadata.
 */
export async function findMediaRequesters(
  mediaType: "movie" | "series",
  ids: { radarr?: number; sonarr?: number; tmdb?: number; tvdb?: number },
): Promise<MediaRequester[]> {
  if (mediaType === "movie" && ids.radarr != null) {
    return findMovieSubscribers(ids.radarr);
  }
  if (mediaType === "series" && ids.sonarr != null) {
    return findSeriesSubscribers(ids.sonarr);
  }

  log.warn("no usable IDs for subscription lookup", { mediaType, ids });
  return [];
}

async function findMovieSubscribers(radarrId: number): Promise<MediaRequester[]> {
  const rows = await db.execute<{
    conversation_id: string;
    interface_type: string;
    metadata: Record<string, unknown>;
    title: string;
  }>(sql`
    SELECT
      ms.conversation_id,
      c.interface_type,
      c.metadata,
      COALESCE(
        (SELECT me.title FROM media_events me
         WHERE me.user_id = ms.user_id
           AND (me.ids->>'radarr')::int = ms.radarr_id
           AND me.action = 'add'
         ORDER BY me.created_at DESC LIMIT 1),
        ''
      ) as title
    FROM movie_subscriptions ms
    JOIN conversations c ON c.id = ms.conversation_id
    WHERE ms.radarr_id = ${radarrId}
      AND ms.active = true
      AND c.interface_type IN ('slack', 'discord')
  `);

  return rowsToRequesters(rows, "movie", { radarr: radarrId });
}

async function findSeriesSubscribers(sonarrId: number): Promise<MediaRequester[]> {
  const rows = await db.execute<{
    conversation_id: string;
    interface_type: string;
    metadata: Record<string, unknown>;
    title: string;
  }>(sql`
    SELECT
      ss.conversation_id,
      c.interface_type,
      c.metadata,
      COALESCE(
        (SELECT me.title FROM media_events me
         WHERE me.user_id = ss.user_id
           AND (me.ids->>'sonarr')::int = ss.sonarr_id
           AND me.action IN ('add', 'download')
         ORDER BY me.created_at DESC LIMIT 1),
        ''
      ) as title
    FROM series_subscriptions ss
    JOIN conversations c ON c.id = ss.conversation_id
    WHERE ss.sonarr_id = ${sonarrId}
      AND ss.active = true
      AND c.interface_type IN ('slack', 'discord')
  `);

  return rowsToRequesters(rows, "series", { sonarr: sonarrId });
}

function rowsToRequesters(
  rows: Array<{
    conversation_id: string;
    interface_type: string;
    metadata: Record<string, unknown>;
    title: string;
  }>,
  mediaType: string,
  ids: Record<string, unknown>,
): MediaRequester[] {
  const requesters: MediaRequester[] = [];

  for (const r of rows) {
    if (r.interface_type === "slack") {
      const channel = r.metadata?.channel as string | undefined;
      const threadTs = r.metadata?.threadTs as string | undefined;
      if (channel && threadTs) {
        requesters.push({
          interfaceType: "slack",
          channel,
          threadTs,
          conversationId: r.conversation_id,
          title: r.title,
        });
      }
    } else if (r.interface_type === "discord") {
      const channelId = r.metadata?.channelId as string | undefined;
      if (channelId) {
        requesters.push({
          interfaceType: "discord",
          channelId,
          conversationId: r.conversation_id,
          title: r.title,
        });
      }
    }
  }

  log.info("found requesters", {
    mediaType,
    ids,
    count: requesters.length,
  });

  return requesters;
}
