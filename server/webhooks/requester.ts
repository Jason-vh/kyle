import { sql } from "drizzle-orm";
import { createLogger } from "../logger.ts";
import { db } from "../db/index.ts";
import type { MediaRequester } from "./types.ts";

const log = createLogger("webhooks:requester");

/**
 * Find conversations where a media item was added, so we can notify the requester.
 * Queries media_refs (action=add) joined with conversations (interfaceType=slack or discord),
 * matching on any of the provided IDs (radarr, sonarr, tmdb, tvdb).
 */
export async function findMediaRequesters(
  mediaType: "movie" | "series",
  ids: { radarr?: number; sonarr?: number; tmdb?: number; tvdb?: number },
): Promise<MediaRequester[]> {
  const conditions: ReturnType<typeof sql>[] = [];

  if (ids.radarr != null) {
    conditions.push(sql`(mr.ids->>'radarr')::int = ${ids.radarr}`);
  }
  if (ids.sonarr != null) {
    conditions.push(sql`(mr.ids->>'sonarr')::int = ${ids.sonarr}`);
  }
  if (ids.tmdb != null) {
    conditions.push(sql`(mr.ids->>'tmdb')::int = ${ids.tmdb}`);
  }
  if (ids.tvdb != null) {
    conditions.push(sql`(mr.ids->>'tvdb')::int = ${ids.tvdb}`);
  }

  if (conditions.length === 0) {
    log.warn("no IDs provided for requester lookup", { mediaType });
    return [];
  }

  const idFilter = conditions.reduce((acc, cond, i) => (i === 0 ? cond : sql`${acc} OR ${cond}`));

  const rows = await db.execute<{
    conversation_id: string;
    interface_type: string;
    metadata: Record<string, unknown>;
    title: string;
  }>(sql`
    SELECT
      c.id AS conversation_id,
      c.interface_type,
      c.metadata,
      mr.title
    FROM media_refs mr
    LEFT JOIN messages m ON m.id = mr.message_id
    JOIN conversations c ON c.id = COALESCE(m.conversation_id, mr.conversation_id)
    WHERE mr.action = 'add'
      AND mr.notify = true
      AND mr.media_type = ${mediaType}
      AND c.interface_type IN ('slack', 'discord')
      AND (${idFilter})
    ORDER BY mr.created_at DESC
  `);

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
