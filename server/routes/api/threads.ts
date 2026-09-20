import { createLogger } from "#server/logger.ts";
import { safeJsonParse } from "#server/json.ts";
import { mediaHref } from "#server/media-links.ts";
import { requireAdmin } from "#server/auth/middleware.ts";
import {
  findConversation,
  listConversationMessages,
  listThreadSummaries,
} from "#server/db/threads.ts";
import { getWebhookNotifications } from "#server/db/webhook-notifications.ts";
import { getMediaEventsForConversation } from "#server/db/media-events.ts";
import { createUsernameResolver } from "#server/threads/usernames.ts";
import {
  buildThreadItems,
  extractTextContent,
  stripMentions,
  type StoredMessage,
} from "#server/threads/items.ts";
import type { ThreadListItem, ThreadDetail, MediaRef } from "#shared/types.ts";
import type { UserMessage } from "@mariozechner/pi-ai";

const log = createLogger("api-threads");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const MAX_TITLE_LENGTH = 80;

/** GET /api/threads — every conversation on the server, so admins only. */
export async function handleApiThreadList(req: Request): Promise<Response> {
  const authResult = await requireAdmin(req);
  if ("error" in authResult) return authResult.error;

  const rows = await listThreadSummaries();

  const items: ThreadListItem[] = rows.map((row) => {
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
      mediaRefs: mediaRefs ?? [],
    };
  });

  log.info("api thread list", { count: items.length });
  return Response.json(items);
}

/** The first thing the user said, trimmed to fit a browser tab. */
function pageTitleFrom(firstUserMessage: UserMessage | undefined): string {
  if (!firstUserMessage) return "Conversation";
  const text = stripMentions(extractTextContent(firstUserMessage));
  if (!text) return "Conversation";
  return text.length > MAX_TITLE_LENGTH ? `${text.slice(0, MAX_TITLE_LENGTH)}\u2026` : text;
}

/** GET /api/threads/:id */
export async function handleApiThreadDetail(req: Request, id: string): Promise<Response> {
  if (!UUID_RE.test(id)) {
    return Response.json({ error: "Invalid thread ID" }, { status: 400 });
  }

  const authResult = await requireAdmin(req);
  if ("error" in authResult) return authResult.error;

  const conversation = await findConversation(id);
  if (!conversation) {
    return Response.json({ error: "Thread not found" }, { status: 404 });
  }

  const [messageRows, webhookNotifications, mediaEventRows] = await Promise.all([
    listConversationMessages(conversation.id),
    getWebhookNotifications(conversation.id),
    getMediaEventsForConversation(conversation.id),
  ]);

  const resolveUsername = await createUsernameResolver(conversation.interfaceType, [
    ...messageRows,
    ...mediaEventRows,
  ]);

  const items = buildThreadItems(
    messageRows.map((row) => ({
      msg: row.data as StoredMessage,
      createdAt: row.createdAt,
      username: resolveUsername(row) ?? "You",
    })),
    webhookNotifications,
  );

  const firstUserMessage = messageRows
    .map((row) => row.data as StoredMessage)
    .find((message): message is UserMessage => message.role === "user");

  const mediaRefs: MediaRef[] = mediaEventRows.map((ref) => ({
    action: ref.action,
    mediaType: ref.mediaType,
    title: ref.title,
    href: mediaHref(ref.mediaType, ref.ids as Record<string, unknown>),
    username: resolveUsername(ref),
  }));

  const detail: ThreadDetail = {
    id: conversation.id,
    interfaceType: conversation.interfaceType,
    pageTitle: pageTitleFrom(firstUserMessage),
    createdAt: conversation.createdAt.toISOString(),
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
