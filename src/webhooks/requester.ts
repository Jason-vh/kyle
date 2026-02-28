import { sql } from "drizzle-orm";
import { createLogger } from "../logger.ts";
import { db } from "../db/index.ts";
import type { MediaRequester } from "./types.ts";

const log = createLogger("webhooks:requester");

/**
 * Find Slack threads where a media item was added, so we can notify the requester.
 * Queries media_refs (action=add) joined with conversations (interfaceType=slack),
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
    channel: string;
    thread_ts: string;
    title: string;
  }>(sql`
    SELECT
      c.metadata->>'channel' AS channel,
      c.metadata->>'threadTs' AS thread_ts,
      mr.title
    FROM media_refs mr
    JOIN conversations c ON c.id = mr.conversation_id
    WHERE mr.action = 'add'
      AND mr.media_type = ${mediaType}
      AND c.interface_type = 'slack'
      AND c.metadata->>'channel' IS NOT NULL
      AND c.metadata->>'threadTs' IS NOT NULL
      AND (${idFilter})
    ORDER BY mr.created_at DESC
  `);

  const requesters: MediaRequester[] = rows.map((r) => ({
    channel: r.channel,
    threadTs: r.thread_ts,
    title: r.title,
  }));

  log.info("found requesters", {
    mediaType,
    ids,
    count: requesters.length,
  });

  return requesters;
}
