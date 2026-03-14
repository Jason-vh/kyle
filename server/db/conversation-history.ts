import { eq, asc } from "drizzle-orm";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { AssistantMessage, TextContent, ImageContent } from "@mariozechner/pi-ai";
import { db } from "./index.ts";
import { messages } from "./schema.ts";
import { getWebhookNotifications, type WebhookNotification } from "./webhook-notifications.ts";

/**
 * Strip base64 image data from user messages to avoid context bloat.
 * Replaces image blocks with a text placeholder so the model knows an image was sent.
 */
function stripImageData(msg: AgentMessage): AgentMessage {
  if (msg.role !== "user") return msg;
  if (typeof msg.content === "string") return msg;

  // AgentMessage with role "user" has content: string | (TextContent | ImageContent)[]
  // but TypeScript can't narrow through the union, so check the array directly
  const content = msg.content as (TextContent | ImageContent)[];

  let hasImages = false;
  const stripped: (TextContent | ImageContent)[] = content.map((block) => {
    if (block.type === "image") {
      hasImages = true;
      return { type: "text" as const, text: "[image]" };
    }
    return block;
  });

  return hasImages ? { ...msg, content: stripped } : msg;
}

export function formatWebhookMessage(n: WebhookNotification): string {
  const service = n.source === "sonarr" ? "Sonarr" : "Radarr";
  const ts = n.receivedAt.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `[Webhook — ${service}] ${n.message} (received ${ts})`;
}

export interface ConversationHistory {
  messages: AgentMessage[];
  timestamps: WeakMap<object, Date>;
}

/**
 * Load a conversation's full message history, interleaving webhook notifications
 * at their correct positions by timestamp.
 */
export async function loadConversationHistory(
  conversationId: string,
): Promise<ConversationHistory> {
  const rows = await db.query.messages.findMany({
    where: eq(messages.conversationId, conversationId),
    orderBy: [asc(messages.sequence)],
  });

  const baseMessages = rows
    .filter(
      (r) =>
        !(
          (r.data as AgentMessage).role === "assistant" &&
          (r.data as AgentMessage as AssistantMessage).stopReason === "error"
        ),
    )
    .map((r) => ({ msg: stripImageData(r.data as AgentMessage), createdAt: r.createdAt }));

  const notifications = await getWebhookNotifications(conversationId);
  const webhookMessages = notifications.map((n) => ({
    msg: { role: "user", content: formatWebhookMessage(n) } as AgentMessage,
    createdAt: n.receivedAt,
  }));

  const timestamps = new WeakMap<object, Date>();
  const sorted = [...baseMessages, ...webhookMessages].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );

  const result = sorted.map((x) => {
    timestamps.set(x.msg, x.createdAt);
    return x.msg;
  });

  return { messages: result, timestamps };
}
