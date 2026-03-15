import { eq, asc, desc, sql, count, ne, inArray } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { conversations, messages, users } from "../../db/schema.ts";
import { signThreadSig, verifyThreadSig } from "../threads-auth.ts";
import { requireAuth } from "../../auth/middleware.ts";
import { resolveUsernames } from "../../slack/users.ts";
import { resolveDiscordUsernames } from "../../discord/users.ts";
import { getWebhookNotifications } from "../../db/webhook-notifications.ts";
import { getMediaEventsForConversation } from "../../db/media-events.ts";
import { createLogger } from "../../logger.ts";
import type {
  ThreadListItem,
  ThreadDetail,
  ThreadItem,
  ThreadMessage,
  ToolCallSummary,
  MediaRef,
} from "../../../shared/types.ts";
import type {
  UserMessage,
  AssistantMessage,
  ImageContent,
  ToolResultMessage,
  TextContent,
  ToolCall,
} from "@mariozechner/pi-ai";

const log = createLogger("api-threads");

const SONARR_HOST = process.env.SONARR_HOST;
const RADARR_HOST = process.env.RADARR_HOST;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// ---------------------------------------------------------------------------
// Tool call summaries (ported from threads-render.ts)
// ---------------------------------------------------------------------------

function toolSummary(tc: ToolCall): string {
  const a = tc.arguments as Record<string, unknown>;
  switch (tc.name) {
    case "search_tmdb_movies":
      return `Searched TMDB movies for '${a.query}'`;
    case "search_tmdb_series":
      return `Searched TMDB series for '${a.query}'`;
    case "search_tmdb":
      return `Searched TMDB for '${a.query}'`;
    case "get_tmdb_movie_details":
      return "Fetched TMDB movie details";
    case "get_tmdb_series_details":
      return "Fetched TMDB series details";
    case "get_all_series":
      return "Checked TV library";
    case "get_series_by_id":
      return "Fetched series details";
    case "search_series":
      return `Searched for series '${a.title}'`;
    case "add_series":
      return a.title ? `Added '${a.title}' to Sonarr` : "Added series to Sonarr";
    case "remove_series":
      return "Removed series from Sonarr";
    case "remove_season":
      return "Removed season from Sonarr";
    case "get_episodes":
      return "Fetched episode list";
    case "get_series_queue":
      return "Checked download queue (TV)";
    case "get_calendar":
      return "Checked upcoming episodes";
    case "download_episodes":
    case "search_episodes":
      return "Searched for missing episodes";
    case "get_series_history":
      return "Checked series history";
    case "get_all_movies":
      return "Checked movie library";
    case "get_radarr_movie":
      return "Fetched movie details";
    case "search_movies":
      return `Searched for movie '${a.title}'`;
    case "add_movie":
      return a.title ? `Added '${a.title}' to Radarr` : "Added movie to Radarr";
    case "remove_movie":
      return "Removed movie from Radarr";
    case "get_movie_queue":
      return "Checked download queue (movies)";
    case "get_movie_history":
      return "Checked movie history";
    case "get_ultra_stats":
      return "Checked seedbox stats";
    case "get_torrents":
      return "Listed torrents";
    case "delete_torrents":
      return "Deleted torrents";
    case "share_conversation":
      return "Generated share link";
    case "convert_time": {
      const from =
        String(a.fromTimezone ?? "")
          .split("/")
          .pop()
          ?.replace(/_/g, " ") ?? "";
      const to =
        String(a.toTimezone ?? "")
          .split("/")
          .pop()
          ?.replace(/_/g, " ") ?? "";
      return `Converted ${a.time} from ${from} to ${to}`;
    }
    case "web_search":
      return `Searched the web for '${a.query}'`;
    case "unsubscribe_notifications":
      return `Unsubscribed from notifications for '${a.title}'`;
    default:
      return tc.name.replace(/_/g, " ");
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractTextContent(msg: UserMessage): string {
  if (typeof msg.content === "string") return msg.content;
  return (
    msg.content
      .filter((c): c is TextContent => c.type === "text")
      .map((c) => c.text)
      .join(" ") || ""
  );
}

function extractImages(msg: UserMessage): { data: string; mimeType: string }[] | undefined {
  if (typeof msg.content === "string") return undefined;
  const images = msg.content
    .filter((c): c is ImageContent => c.type === "image")
    .map((c) => ({ data: c.data, mimeType: c.mimeType }));
  return images.length > 0 ? images : undefined;
}

function prettyPrint(str: string): string {
  try {
    return JSON.stringify(JSON.parse(str), null, 2);
  } catch {
    return str;
  }
}

function stripMentions(text: string): string {
  return text.replace(/<@[A-Z0-9]+>/g, "").trim();
}

// ---------------------------------------------------------------------------
// Auth helper — returns 401 JSON instead of HTML redirect
// ---------------------------------------------------------------------------

async function checkApiAuth(
  req: Request,
): Promise<{ error: Response } | { refreshHeaders?: Record<string, string> }> {
  const result = await requireAuth(req);
  if ("error" in result) return { error: result.error };
  return { refreshHeaders: result.refreshHeaders };
}

// ---------------------------------------------------------------------------
// GET /api/threads
// ---------------------------------------------------------------------------

export async function handleApiThreadList(req: Request): Promise<Response> {
  const url = new URL(req.url);

  const authResult = await checkApiAuth(req);
  if ("error" in authResult) return authResult.error;

  const msgCounts = db
    .select({
      conversationId: messages.conversationId,
      msgCount: count().as("msg_count"),
    })
    .from(messages)
    .where(ne(messages.role, "toolResult"))
    .groupBy(messages.conversationId)
    .as("msg_counts");

  const rows = await db
    .select({
      id: conversations.id,
      interfaceType: conversations.interfaceType,
      createdAt: conversations.createdAt,
      messageCount: msgCounts.msgCount,
      preview: sql<string | null>`(
        SELECT CASE
          WHEN jsonb_typeof(data->'content') = 'string' THEN data->>'content'
          WHEN jsonb_typeof(data->'content') = 'array'  THEN (
            SELECT elem->>'text'
            FROM jsonb_array_elements(data->'content') AS elem
            WHERE elem->>'type' = 'text'
            LIMIT 1
          )
        END
        FROM ${messages}
        WHERE ${messages.conversationId} = ${conversations.id}
          AND role = 'user'
        ORDER BY sequence ASC
        LIMIT 1
      )`.as("preview"),
      mediaRefsJson: sql<string | null>`(
        SELECT json_agg(
          json_build_object('action', action, 'title', title)
          ORDER BY created_at ASC
        )::text
        FROM (
          SELECT action, title, created_at
          FROM media_events
          WHERE conversation_id = ${conversations.id}
          LIMIT 5
        ) sub
      )`.as("media_refs_json"),
    })
    .from(conversations)
    .leftJoin(msgCounts, sql`${conversations.id} = ${msgCounts.conversationId}`)
    .where(inArray(conversations.interfaceType, ["slack", "discord"]))
    .orderBy(desc(conversations.createdAt))
    .limit(200);

  const items: ThreadListItem[] = await Promise.all(
    rows.map(async (row) => {
      const sig = await signThreadSig(row.id).catch(() => null);
      const shareUrl = sig ? `${url.origin}/threads/${row.id}?sig=${sig}` : null;

      let mediaRefs: { action: string; title: string }[] = [];
      if (row.mediaRefsJson) {
        try {
          mediaRefs = JSON.parse(row.mediaRefsJson);
        } catch {
          // ignore
        }
      }

      let preview = row.preview || "";
      preview = stripMentions(preview);
      if (!preview) preview = "Untitled conversation";

      return {
        id: row.id,
        interfaceType: row.interfaceType,
        preview,
        messageCount: row.messageCount ?? 0,
        createdAt: row.createdAt.toISOString(),
        shareUrl,
        mediaRefs,
      };
    }),
  );

  log.info("api thread list", { count: items.length });
  return Response.json(items);
}

// ---------------------------------------------------------------------------
// GET /api/threads/:uuid
// ---------------------------------------------------------------------------

export async function handleApiThreadDetail(req: Request, id: string): Promise<Response> {
  if (!UUID_RE.test(id)) {
    return Response.json({ error: "Invalid thread ID" }, { status: 400 });
  }

  const url = new URL(req.url);

  // Signed URL: anyone with ?sig= can view this specific thread
  const sig = url.searchParams.get("sig");
  if (sig) {
    const valid = await verifyThreadSig(id, sig);
    if (!valid) {
      return Response.json({ error: "Invalid or expired link" }, { status: 403 });
    }
  } else {
    const authResult = await checkApiAuth(req);
    if ("error" in authResult) return authResult.error;
  }

  const conv = await db.query.conversations.findFirst({
    where: (c, { eq: e }) => e(c.id, id),
  });

  if (!conv) {
    return Response.json({ error: "Thread not found" }, { status: 404 });
  }

  const rows = await db
    .select({
      data: messages.data,
      createdAt: messages.createdAt,
      platformUserId: messages.platformUserId,
      userId: messages.userId,
    })
    .from(messages)
    .where(eq(messages.conversationId, conv.id))
    .orderBy(asc(messages.sequence));

  const msgs = rows.map((r) => ({
    msg: r.data as UserMessage | AssistantMessage | ToolResultMessage,
    createdAt: r.createdAt,
    platformUserId: r.platformUserId,
    userId: r.userId,
  }));

  const [webhookNotifications, mediaEventRows] = await Promise.all([
    getWebhookNotifications(conv.id),
    getMediaEventsForConversation(conv.id),
  ]);

  // Resolve usernames — prefer app user display names, fall back to platform API
  const appUserIds = [
    ...new Set([
      ...rows.filter((r) => r.userId).map((r) => r.userId!),
      ...mediaEventRows.filter((r) => r.userId).map((r) => r.userId!),
    ]),
  ];
  const appUserNameMap = new Map<string, string>();
  if (appUserIds.length > 0) {
    const appUsers = await db
      .select({ id: users.id, displayName: users.displayName })
      .from(users)
      .where(inArray(users.id, appUserIds));
    for (const u of appUsers) {
      appUserNameMap.set(u.id, u.displayName);
    }
  }

  // For messages/media events without an app user, fall back to platform API
  const unresolvedPlatformIds = [
    ...new Set([
      ...rows.filter((r) => !r.userId && r.platformUserId).map((r) => r.platformUserId!),
      ...mediaEventRows.filter((r) => !r.userId && r.platformUserId).map((r) => r.platformUserId!),
    ]),
  ];
  let platformUsernameMap = new Map<string, string>();
  if (unresolvedPlatformIds.length > 0) {
    try {
      platformUsernameMap =
        conv.interfaceType === "discord"
          ? await resolveDiscordUsernames(unresolvedPlatformIds)
          : await resolveUsernames(unresolvedPlatformIds);
    } catch (err) {
      log.warn("failed to resolve usernames", {
        platformUserIds: unresolvedPlatformIds,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Page title from first user message
  let pageTitle = "Conversation";
  const firstUser = msgs.find((m) => m.msg.role === "user");
  if (firstUser) {
    let text = extractTextContent(firstUser.msg as UserMessage);
    text = stripMentions(text);
    if (text.length > 80) text = text.slice(0, 80) + "…";
    if (text) pageTitle = text;
  }

  // Build result map for tool call pairing
  const resultMap = new Map<string, ToolResultMessage>();
  for (const { msg } of msgs) {
    if (msg.role === "toolResult") {
      resultMap.set(msg.toolCallId, msg);
    }
  }

  // Share URL (only for cookie-authenticated, not sig-authenticated)
  let shareUrl: string | null = null;
  if (!sig) {
    try {
      const threadSig = await signThreadSig(id);
      shareUrl = `${url.origin}/threads/${id}?sig=${threadSig}`;
    } catch {
      // non-fatal
    }
  }

  // Build media refs with pre-computed hrefs
  const apiMediaRefs: MediaRef[] = mediaEventRows.map((ref) => {
    const ids = ref.ids as Record<string, unknown>;
    let href: string | null = null;
    if (ref.mediaType === "movie" && RADARR_HOST && ids.titleSlug) {
      href = `${RADARR_HOST}/movie/${ids.titleSlug}`;
    } else if (ref.mediaType === "series" && SONARR_HOST && ids.titleSlug) {
      href = `${SONARR_HOST}/series/${ids.titleSlug}`;
    }

    return {
      action: ref.action,
      mediaType: ref.mediaType,
      title: ref.title,
      href,
      username:
        (ref.userId && appUserNameMap.get(ref.userId)) ??
        (ref.platformUserId && platformUsernameMap.get(ref.platformUserId)) ??
        null,
    };
  });

  // Interleave messages and webhooks by timestamp
  interface MsgItem {
    kind: "message";
    idx: number;
    ts: number;
  }
  interface WebhookItem {
    kind: "webhook";
    idx: number;
    ts: number;
  }
  type RenderItem = MsgItem | WebhookItem;

  const allItems: RenderItem[] = [
    ...msgs.map(
      (m, i): RenderItem => ({
        kind: "message",
        idx: i,
        ts: m.createdAt.getTime(),
      }),
    ),
    ...webhookNotifications.map(
      (n, i): RenderItem => ({
        kind: "webhook",
        idx: i,
        ts: n.receivedAt.getTime(),
      }),
    ),
  ].sort((a, b) => a.ts - b.ts);

  let msgCounter = 0;
  let webhookCounter = 0;
  const items: ThreadItem[] = [];

  for (const item of allItems) {
    if (item.kind === "message") {
      const { msg, createdAt, platformUserId, userId: msgUserId } = msgs[item.idx]!;

      // Skip toolResult — they're folded into tool calls
      if (msg.role === "toolResult") continue;

      const itemId = `msg-${msgCounter++}`;
      const username =
        (msgUserId && appUserNameMap.get(msgUserId)) ??
        (platformUserId && platformUsernameMap.get(platformUserId)) ??
        "You";

      if (msg.role === "user") {
        const text = extractTextContent(msg);
        const images = extractImages(msg);
        items.push({
          kind: "message",
          message: {
            id: itemId,
            role: "user",
            createdAt: createdAt.toISOString(),
            username,
            textContent: text,
            images,
          },
        });
      } else if (msg.role === "assistant") {
        const assistantMsg = msg as AssistantMessage;
        const threadMessage: ThreadMessage = {
          id: itemId,
          role: "assistant",
          createdAt: createdAt.toISOString(),
          username: "Kyle",
          stopReason: assistantMsg.stopReason,
        };

        if (assistantMsg.stopReason === "error") {
          // Error message
          let friendlyMsg = "Something went wrong while processing this message.";
          if (assistantMsg.errorMessage) {
            try {
              const parsed = JSON.parse(assistantMsg.errorMessage);
              if (parsed.error?.message) friendlyMsg = parsed.error.message;
              else if (typeof parsed.message === "string") friendlyMsg = parsed.message;
            } catch {
              if (assistantMsg.errorMessage.length < 200) friendlyMsg = assistantMsg.errorMessage;
            }
          }
          threadMessage.errorMessage = friendlyMsg;
          threadMessage.errorRaw = assistantMsg.errorMessage
            ? prettyPrint(assistantMsg.errorMessage)
            : undefined;
          threadMessage.hasErrors = true;
        } else if (assistantMsg.stopReason === "toolUse") {
          // Tool use message — collect tool calls and thinking text
          const toolCalls: ToolCallSummary[] = [];
          const textParts: string[] = [];

          for (const block of assistantMsg.content) {
            if (block.type === "text" && block.text.trim()) {
              textParts.push(block.text);
            } else if (block.type === "toolCall") {
              const result = resultMap.get(block.id);
              const isError = result?.isError ?? false;
              let resultText: string | undefined;
              if (result) {
                resultText = prettyPrint(
                  result.content
                    .filter((c): c is TextContent => c.type === "text")
                    .map((c) => c.text)
                    .join("\n"),
                );
              }
              toolCalls.push({
                id: block.id,
                name: block.name,
                summaryText: toolSummary(block),
                arguments: block.arguments,
                result: result ? { isError, text: resultText! } : undefined,
              });
            }
          }

          threadMessage.textContent = textParts.length > 0 ? textParts.join("\n\n") : undefined;
          threadMessage.toolCalls = toolCalls;
          threadMessage.hasErrors = toolCalls.some((tc) => tc.result?.isError);
        } else {
          // endTurn — final text response, possibly with inline tool calls
          const textParts: string[] = [];
          const toolCalls: ToolCallSummary[] = [];

          for (const block of assistantMsg.content) {
            if (block.type === "text") {
              textParts.push(block.text);
            } else if (block.type === "toolCall") {
              const result = resultMap.get(block.id);
              const isError = result?.isError ?? false;
              toolCalls.push({
                id: block.id,
                name: block.name,
                summaryText: toolSummary(block),
                arguments: block.arguments,
                result: result
                  ? {
                      isError,
                      text: prettyPrint(
                        result.content
                          .filter((c): c is TextContent => c.type === "text")
                          .map((c) => c.text)
                          .join("\n"),
                      ),
                    }
                  : undefined,
              });
            }
          }

          threadMessage.textContent = textParts.join("\n\n") || undefined;
          if (toolCalls.length > 0) threadMessage.toolCalls = toolCalls;
        }

        items.push({ kind: "message", message: threadMessage });
      }
    } else {
      const n = webhookNotifications[item.idx]!;
      items.push({
        kind: "webhook",
        notification: {
          id: `webhook-${webhookCounter++}`,
          source: n.source,
          receivedAt: n.receivedAt.toISOString(),
          payload: n.payload,
        },
      });
    }
  }

  const detail: ThreadDetail = {
    id: conv.id,
    interfaceType: conv.interfaceType,
    pageTitle,
    createdAt: conv.createdAt.toISOString(),
    shareUrl,
    mediaRefs: apiMediaRefs,
    items,
  };

  log.info("api thread detail", {
    id,
    messageCount: msgs.length,
    itemCount: items.length,
  });

  return Response.json(detail);
}
