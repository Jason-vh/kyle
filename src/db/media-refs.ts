import { sql } from "drizzle-orm";
import { createLogger } from "../logger.ts";
import { db } from "./index.ts";
import { mediaRefs } from "./schema.ts";

const log = createLogger("media-refs");

interface MediaRefIds {
  tmdb?: number;
  imdb?: string;
  tvdb?: number;
  radarr?: number;
  sonarr?: number;
}

export interface MediaRefData {
  action: string;
  mediaType: string;
  title: string;
  ids: MediaRefIds;
}

/**
 * Extract a media ref from a tool execution result.
 * Returns null for non-tracked tools or if parsing fails.
 */
export function extractMediaRef(
  toolName: string,
  args: Record<string, unknown>,
  result: { content?: Array<{ type: string; text?: string }> },
): MediaRefData | null {
  // Parse the JSON text content from the tool result
  const textContent = result.content?.find((c) => c.type === "text");
  if (!textContent?.text) return null;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(textContent.text);
  } catch {
    return null;
  }

  switch (toolName) {
    case "add_movie":
      return {
        action: "add",
        mediaType: "movie",
        title: parsed.title as string,
        ids: {
          tmdb: args.tmdbId as number,
          radarr: parsed.id as number,
        },
      };

    case "remove_movie":
      return {
        action: "remove",
        mediaType: "movie",
        title: parsed.title as string,
        ids: {
          radarr: parsed.radarrId as number,
          tmdb: parsed.tmdbId as number,
          imdb: parsed.imdbId as string | undefined,
        },
      };

    case "add_series": {
      const series = parsed.series as Record<string, unknown> | undefined;
      return {
        action: "add",
        mediaType: "series",
        title: args.title as string,
        ids: {
          tvdb: args.tvdbId as number,
          sonarr: series?.id as number,
        },
      };
    }

    case "remove_series":
      return {
        action: "remove",
        mediaType: "series",
        title: parsed.title as string,
        ids: {
          sonarr: parsed.sonarrId as number,
          tvdb: parsed.tvdbId as number,
          tmdb: parsed.tmdbId as number | undefined,
          imdb: parsed.imdbId as string | undefined,
        },
      };

    case "remove_season":
      return {
        action: "remove",
        mediaType: "series",
        title: parsed.title as string,
        ids: {
          sonarr: parsed.sonarrId as number,
          tvdb: parsed.tvdbId as number,
          tmdb: parsed.tmdbId as number | undefined,
        },
      };

    default:
      return null;
  }
}

/**
 * Get all media requests for a given user, ordered by most recent first.
 */
export async function getRequestsForUser(
  userId: string,
): Promise<(MediaRefData & { date: string })[]> {
  const rows = await db.execute<{
    action: string;
    media_type: string;
    title: string;
    ids: MediaRefIds;
    created_at: string;
  }>(sql`
    SELECT mr.action, mr.media_type, mr.title, mr.ids, mr.created_at
    FROM media_refs mr
    JOIN conversations c ON c.id = mr.conversation_id
    WHERE c.user_id = ${userId}
    ORDER BY mr.created_at DESC
  `);

  return rows.map((r) => ({
    action: r.action,
    mediaType: r.media_type,
    title: r.title,
    ids: r.ids as MediaRefIds,
    date: r.created_at,
  }));
}

/**
 * Save a media ref to the database. Non-fatal — logs errors but doesn't throw.
 */
export async function saveMediaRef(
  conversationId: string,
  toolCallId: string,
  ref: MediaRefData,
): Promise<void> {
  try {
    await db.insert(mediaRefs).values({
      conversationId,
      toolCallId,
      action: ref.action,
      mediaType: ref.mediaType,
      title: ref.title,
      ids: ref.ids,
    });
    log.info("saved media ref", {
      conversationId,
      toolCallId,
      action: ref.action,
      mediaType: ref.mediaType,
      title: ref.title,
    });
  } catch (error) {
    log.error("failed to save media ref", {
      conversationId,
      toolCallId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
