import { sql, eq, asc } from "drizzle-orm";
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
  titleSlug?: string;
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
          titleSlug: parsed.titleSlug as string | undefined,
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
          titleSlug: parsed.titleSlug as string | undefined,
        },
      };

    case "add_series": {
      const series = parsed.series as Record<string, unknown> | undefined;
      return {
        action: "add",
        mediaType: "series",
        title: (series?.title as string) ?? (args.title as string),
        ids: {
          tvdb: args.tvdbId as number,
          sonarr: series?.id as number,
          titleSlug: series?.titleSlug as string | undefined,
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
          titleSlug: parsed.titleSlug as string | undefined,
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
          titleSlug: parsed.titleSlug as string | undefined,
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
    SELECT action, media_type, title, ids, created_at
    FROM media_refs
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
  `);

  return rows.map((r) => ({
    action: r.action,
    mediaType: r.media_type,
    title: r.title,
    ids: r.ids as MediaRefIds,
    date: r.created_at,
  }));
}

export interface MediaRefRow {
  id: string;
  action: string;
  mediaType: string;
  title: string;
  ids: MediaRefIds;
  platformUserId: string | null;
  userId: string | null;
  createdAt: Date;
}

/**
 * Get all media refs for a conversation, ordered by creation time.
 */
export async function getMediaRefsForConversation(conversationId: string): Promise<MediaRefRow[]> {
  const rows = await db
    .select()
    .from(mediaRefs)
    .where(eq(mediaRefs.conversationId, conversationId))
    .orderBy(asc(mediaRefs.createdAt));

  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    mediaType: r.mediaType,
    title: r.title,
    ids: r.ids as MediaRefIds,
    platformUserId: r.platformUserId,
    userId: r.userId,
    createdAt: r.createdAt,
  }));
}

/**
 * Save a media ref to the database. Non-fatal — logs errors but doesn't throw.
 */
export async function saveMediaRef(
  conversationId: string,
  toolCallId: string,
  ref: MediaRefData,
  platformUserId: string,
  messageId: string,
  appUserId?: string | null,
): Promise<void> {
  try {
    await db.insert(mediaRefs).values({
      conversationId,
      toolCallId,
      messageId,
      platformUserId,
      userId: appUserId ?? null,
      action: ref.action,
      mediaType: ref.mediaType,
      title: ref.title,
      ids: ref.ids,
    });
    log.info("saved media ref", {
      conversationId,
      toolCallId,
      messageId,
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
