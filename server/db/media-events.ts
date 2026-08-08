import { eq, asc } from "drizzle-orm";
import { createLogger } from "../logger.ts";
import { db } from "./index.ts";
import { mediaEvents } from "./schema.ts";

const log = createLogger("media-events");

interface MediaEventIds {
  tmdb?: number;
  imdb?: string;
  tvdb?: number;
  radarr?: number;
  sonarr?: number;
  titleSlug?: string;
}

export interface MediaEventData {
  action: string;
  mediaType: string;
  title: string;
  ids: MediaEventIds;
  seasonNumber?: number;
  episodeNumber?: number;
}

/**
 * Extract a media event from a tool execution result.
 * Returns null for non-tracked tools or if parsing fails.
 */
export function extractMediaEvent(
  toolName: string,
  args: Record<string, unknown>,
  result: { content?: Array<{ type: string; text?: string }> },
): MediaEventData | null {
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
        seasonNumber: (args.seasonNumber as number) ?? (parsed.seasonNumber as number | undefined),
      };

    case "download_episodes":
    case "search_episodes":
      // Handle both current and historical tool name
      if (parsed.seriesTitle && parsed.seriesId) {
        return {
          action: "download",
          mediaType: "series",
          title: parsed.seriesTitle as string,
          ids: {
            sonarr: parsed.seriesId as number,
            tvdb: parsed.tvdbId as number | undefined,
          },
          seasonNumber: args.seasonNumber as number | undefined,
        };
      }
      return null;

    default:
      return null;
  }
}

export interface MediaEventRow {
  id: string;
  action: string;
  mediaType: string;
  title: string;
  ids: MediaEventIds;
  seasonNumber: number | null;
  episodeNumber: number | null;
  platformUserId: string | null;
  userId: string | null;
  createdAt: Date;
}

/**
 * Get all media events for a conversation, ordered by creation time.
 */
export async function getMediaEventsForConversation(
  conversationId: string,
): Promise<MediaEventRow[]> {
  const rows = await db
    .select()
    .from(mediaEvents)
    .where(eq(mediaEvents.conversationId, conversationId))
    .orderBy(asc(mediaEvents.createdAt));

  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    mediaType: r.mediaType,
    title: r.title,
    ids: r.ids as MediaEventIds,
    seasonNumber: r.seasonNumber,
    episodeNumber: r.episodeNumber,
    platformUserId: r.platformUserId,
    userId: r.userId,
    createdAt: r.createdAt,
  }));
}

/**
 * Save a media event to the database. Non-fatal — logs errors but doesn't throw.
 */
export async function saveMediaEvent(
  conversationId: string,
  toolCallId: string,
  event: MediaEventData,
  platformUserId: string,
  messageId: string,
  appUserId?: string | null,
): Promise<void> {
  try {
    await db.insert(mediaEvents).values({
      conversationId,
      toolCallId,
      messageId,
      platformUserId,
      userId: appUserId ?? null,
      action: event.action,
      mediaType: event.mediaType,
      title: event.title,
      ids: event.ids,
      seasonNumber: event.seasonNumber ?? null,
      episodeNumber: event.episodeNumber ?? null,
    });
    log.info("saved media event", {
      conversationId,
      toolCallId,
      messageId,
      action: event.action,
      mediaType: event.mediaType,
      title: event.title,
    });
  } catch (error) {
    log.error("failed to save media event", {
      conversationId,
      toolCallId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
