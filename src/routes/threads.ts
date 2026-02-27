import { eq, like, asc } from "drizzle-orm";
import { db } from "../db/index.ts";
import { conversations, messages } from "../db/schema.ts";
import { checkAuth, signThreadSig, verifyThreadSig } from "./threads-auth.ts";
import { renderThreadPage } from "./threads-render.ts";
import { resolveUsernames } from "../slack/users.ts";
import { getWebhookNotifications } from "../db/webhook-notifications.ts";
import { createLogger } from "../logger.ts";

const log = createLogger("threads");

const THREAD_TS_RE = /^\d+\.\d+$/;

export async function handleThread(
  req: Request,
  threadTs: string
): Promise<Response> {
  const url = new URL(req.url);

  // Signed URL: anyone with ?sig= can view this specific thread
  const sig = url.searchParams.get("sig");
  if (sig) {
    const valid = await verifyThreadSig(threadTs, sig);
    if (!valid) {
      return new Response("Invalid or expired link", { status: 403 });
    }
  } else {
    // Fall back to cookie auth
    const authResponse = await checkAuth(req, url);
    if (authResponse) return authResponse;
  }

  if (!THREAD_TS_RE.test(threadTs)) {
    log.warn("invalid thread_ts format", { threadTs });
    return new Response("Invalid thread ID", { status: 400 });
  }

  const conv = await db.query.conversations.findFirst({
    where: (c, { and, eq: e, like: l }) =>
      and(e(c.interfaceType, "slack"), l(c.externalId, `%:${threadTs}`)),
  });

  if (!conv) {
    log.warn("conversation not found", { threadTs });
    return new Response("Thread not found", { status: 404 });
  }

  const rows = await db
    .select({ data: messages.data })
    .from(messages)
    .where(eq(messages.conversationId, conv.id))
    .orderBy(asc(messages.sequence));

  const msgs = rows.map((r) => r.data as any);

  // Resolve Slack username if we have a userId
  let username = "You";
  if (conv.userId) {
    try {
      const names = await resolveUsernames([conv.userId]);
      username = names.get(conv.userId) ?? "You";
    } catch (err) {
      log.warn("failed to resolve username", {
        userId: conv.userId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const webhookNotifications = await getWebhookNotifications(conv.id);

  log.info("rendering thread", {
    threadTs,
    conversationId: conv.id,
    messageCount: msgs.length,
    webhookCount: webhookNotifications.length,
    username,
  });

  // Provide share URL only to cookie-authenticated users (not sig-authenticated)
  let shareUrl: string | undefined;
  if (!sig) {
    try {
      const threadSig = await signThreadSig(threadTs);
      shareUrl = `${url.origin}/threads/${threadTs}?sig=${threadSig}`;
    } catch {
      // non-fatal
    }
  }

  const html = renderThreadPage(threadTs, conv.createdAt, msgs, username, shareUrl, webhookNotifications);
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
