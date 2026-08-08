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
import {
  buildThreadItems,
  extractTextContent,
  stripMentions,
  type StoredMessage,
} from "../../threads/items.ts";
import type { ThreadListItem, ThreadDetail, MediaRef } from "../../../shared/types.ts";
import type { UserMessage } from "@mariozechner/pi-ai";
import { errorMessage } from "../../errors.ts";
import { safeJsonParse } from "../../json.ts";

const log = createLogger("api-threads");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Rows that carry a platform author, either app user or platform-native. */
interface AuthoredRow {
  userId: string | null;
  platformUserId: string | null;
}

/** Resolves display names, preferring linked app users over the platform directory. */
async function createUsernameResolver(
  interfaceType: string,
  rows: AuthoredRow[],
): Promise<(row: AuthoredRow) => string | null> {
  const appUserIds = [...new Set(rows.map((r) => r.userId).filter((id) => id !== null))];
  const appNames = new Map<string, string>();
  if (appUserIds.length > 0) {
    const appUsers = await db
      .select({ id: users.id, displayName: users.displayName })
      .from(users)
      .where(inArray(users.id, appUserIds));
    for (const u of appUsers) appNames.set(u.id, u.displayName);
  }

  const platformIds = [
    ...new Set(
      rows
        .filter((r) => !r.userId)
        .map((r) => r.platformUserId)
        .filter((id) => id !== null),
    ),
  ];
  let platformNames = new Map<string, string>();
  if (platformIds.length > 0) {
    try {
      platformNames =
        interfaceType === "discord"
          ? await resolveDiscordUsernames(platformIds)
          : await resolveUsernames(platformIds);
    } catch (err) {
      log.warn("failed to resolve usernames", {
        platformUserIds: platformIds,
        error: errorMessage(err),
      });
    }
  }

  return (row) =>
    (row.userId && appNames.get(row.userId)) ??
    (row.platformUserId && platformNames.get(row.platformUserId)) ??
    null;
}

function mediaRefHref(mediaType: string, ids: Record<string, unknown>): string | null {
  const titleSlug = ids.titleSlug;
  if (!titleSlug) return null;
  if (mediaType === "movie" && process.env.RADARR_HOST) {
    return `${process.env.RADARR_HOST}/movie/${titleSlug}`;
  }
  if (mediaType === "series" && process.env.SONARR_HOST) {
    return `${process.env.SONARR_HOST}/series/${titleSlug}`;
  }
  return null;
}

async function shareUrlFor(origin: string, id: string): Promise<string | null> {
  const sig = await signThreadSig(id).catch(() => null);
  return sig ? `${origin}/threads/${id}?sig=${sig}` : null;
}

// ---------------------------------------------------------------------------
// GET /api/threads
// ---------------------------------------------------------------------------

export async function handleApiThreadList(req: Request): Promise<Response> {
  const authResult = await requireAuth(req);
  if ("error" in authResult) return authResult.error;

  const url = new URL(req.url);

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
      const mediaRefs = row.mediaRefsJson
        ? safeJsonParse<{ action: string; title: string }[]>(row.mediaRefsJson)
        : [];
      if (!mediaRefs) log.warn("unparseable media refs", { conversationId: row.id });

      return {
        id: row.id,
        interfaceType: row.interfaceType,
        preview: stripMentions(row.preview || "") || "Untitled conversation",
        messageCount: row.messageCount ?? 0,
        createdAt: row.createdAt.toISOString(),
        shareUrl: await shareUrlFor(url.origin, row.id),
        mediaRefs: mediaRefs ?? [],
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

  // A signed URL grants access to this one thread; otherwise a session is required.
  const sig = url.searchParams.get("sig");
  if (sig) {
    if (!(await verifyThreadSig(id, sig))) {
      return Response.json({ error: "Invalid or expired link" }, { status: 403 });
    }
  } else {
    const authResult = await requireAuth(req);
    if ("error" in authResult) return authResult.error;
  }

  const conv = await db.query.conversations.findFirst({
    where: (c, { eq: e }) => e(c.id, id),
  });

  if (!conv) {
    return Response.json({ error: "Thread not found" }, { status: 404 });
  }

  const [messageRows, webhookNotifications, mediaEventRows] = await Promise.all([
    db
      .select({
        data: messages.data,
        createdAt: messages.createdAt,
        platformUserId: messages.platformUserId,
        userId: messages.userId,
      })
      .from(messages)
      .where(eq(messages.conversationId, conv.id))
      .orderBy(asc(messages.sequence)),
    getWebhookNotifications(conv.id),
    getMediaEventsForConversation(conv.id),
  ]);

  const resolveUsername = await createUsernameResolver(conv.interfaceType, [
    ...messageRows,
    ...mediaEventRows,
  ]);

  const items = buildThreadItems(
    messageRows.map((r) => ({
      msg: r.data as StoredMessage,
      createdAt: r.createdAt,
      username: resolveUsername(r) ?? "You",
    })),
    webhookNotifications,
  );

  const mediaRefs: MediaRef[] = mediaEventRows.map((ref) => ({
    action: ref.action,
    mediaType: ref.mediaType,
    title: ref.title,
    href: mediaRefHref(ref.mediaType, ref.ids as Record<string, unknown>),
    username: resolveUsername(ref),
  }));

  const firstUser = messageRows.find((r) => (r.data as StoredMessage).role === "user");
  const firstUserText = firstUser
    ? stripMentions(extractTextContent(firstUser.data as UserMessage))
    : "";
  const pageTitle =
    (firstUserText.length > 80 ? `${firstUserText.slice(0, 80)}\u2026` : firstUserText) ||
    "Conversation";

  const detail: ThreadDetail = {
    id: conv.id,
    interfaceType: conv.interfaceType,
    pageTitle,
    createdAt: conv.createdAt.toISOString(),
    // Sharing is offered to signed-in viewers only; a shared link cannot reshare itself.
    shareUrl: sig ? null : await shareUrlFor(url.origin, id),
    mediaRefs,
    items,
  };

  log.info("api thread detail", {
    id,
    messageCount: messageRows.length,
    itemCount: items.length,
  });

  return Response.json(detail);
}
