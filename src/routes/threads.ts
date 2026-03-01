import { eq, asc } from "drizzle-orm";
import { db } from "../db/index.ts";
import { messages } from "../db/schema.ts";
import { checkAuth, signThreadSig, verifyThreadSig } from "./threads-auth.ts";
import { renderThreadPage } from "./threads-render.ts";
import { resolveUsernames } from "../slack/users.ts";
import { resolveDiscordUsernames } from "../discord/users.ts";
import { getWebhookNotifications } from "../db/webhook-notifications.ts";
import { getMediaRefsForConversation } from "../db/media-refs.ts";
import { createLogger } from "../logger.ts";

const log = createLogger("threads");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function handleThread(req: Request, id: string): Promise<Response> {
  const url = new URL(req.url);

  // Signed URL: anyone with ?sig= can view this specific thread
  const sig = url.searchParams.get("sig");
  if (sig) {
    const valid = await verifyThreadSig(id, sig);
    if (!valid) {
      return new Response("Invalid or expired link", { status: 403 });
    }
  } else {
    // Fall back to cookie auth
    const authResponse = await checkAuth(req, url);
    if (authResponse) return authResponse;
  }

  if (!UUID_RE.test(id)) {
    log.warn("invalid thread ID format", { id });
    return new Response("Invalid thread ID", { status: 400 });
  }

  const conv = await db.query.conversations.findFirst({
    where: (c, { eq: e }) => e(c.id, id),
  });

  if (!conv) {
    log.warn("conversation not found", { id });
    return new Response("Thread not found", { status: 404 });
  }

  const rows = await db
    .select({ data: messages.data, createdAt: messages.createdAt, userId: messages.userId })
    .from(messages)
    .where(eq(messages.conversationId, conv.id))
    .orderBy(asc(messages.sequence));

  const msgs = rows.map((r) => ({ msg: r.data as any, createdAt: r.createdAt, userId: r.userId }));

  const [webhookNotifications, mediaRefs] = await Promise.all([
    getWebhookNotifications(conv.id),
    getMediaRefsForConversation(conv.id),
  ]);

  // Collect distinct userIds from user-role messages + media refs and batch-resolve
  const userIds = [
    ...new Set([
      ...rows.filter((r) => r.userId).map((r) => r.userId!),
      ...mediaRefs.filter((r) => r.userId).map((r) => r.userId!),
    ]),
  ];
  let usernameMap = new Map<string, string>();
  if (userIds.length > 0) {
    try {
      usernameMap =
        conv.interfaceType === "discord"
          ? await resolveDiscordUsernames(userIds)
          : await resolveUsernames(userIds);
    } catch (err) {
      log.warn("failed to resolve usernames", {
        userIds,
        interfaceType: conv.interfaceType,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Generate thread label from interface type + metadata
  let threadLabel: string;
  if (conv.interfaceType === "discord") {
    const meta = conv.metadata as Record<string, unknown> | null;
    threadLabel = meta?.isDM ? "Discord DM" : "Discord Thread";
  } else {
    const meta = conv.metadata as Record<string, unknown> | null;
    threadLabel = (meta?.threadTs as string) ?? conv.externalId ?? id;
  }

  log.info("rendering thread", {
    id,
    interfaceType: conv.interfaceType,
    conversationId: conv.id,
    messageCount: msgs.length,
    webhookCount: webhookNotifications.length,
    mediaRefCount: mediaRefs.length,
    userCount: userIds.length,
  });

  // Provide share URL only to cookie-authenticated users (not sig-authenticated)
  let shareUrl: string | undefined;
  if (!sig) {
    try {
      const threadSig = await signThreadSig(id);
      shareUrl = `${url.origin}/threads/${id}?sig=${threadSig}`;
    } catch {
      // non-fatal
    }
  }

  const html = renderThreadPage(
    threadLabel,
    conv.createdAt,
    msgs,
    usernameMap,
    shareUrl,
    webhookNotifications,
    mediaRefs,
  );
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
