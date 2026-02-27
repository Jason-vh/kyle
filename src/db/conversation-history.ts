import { eq, asc } from "drizzle-orm";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { AssistantMessage } from "@mariozechner/pi-ai";
import { db } from "./index.ts";
import { messages } from "./schema.ts";
import { getWebhookNotifications, type WebhookNotification } from "./webhook-notifications.ts";

export function formatWebhookMessage(n: WebhookNotification): string {
  const service = n.source === "sonarr" ? "Sonarr" : "Radarr";
  const ts = n.receivedAt.toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
  return `[Webhook — ${service}] ${n.message} (received ${ts})`;
}

/**
 * Load a conversation's full message history, interleaving webhook notifications
 * at their correct positions by timestamp.
 */
export async function loadConversationHistory(conversationId: string): Promise<AgentMessage[]> {
  const rows = await db.query.messages.findMany({
    where: eq(messages.conversationId, conversationId),
    orderBy: [asc(messages.sequence)],
  });

  const baseMessages = rows
    .filter((r) => !((r.data as AgentMessage).role === "assistant" && ((r.data as AgentMessage) as AssistantMessage).stopReason === "error"))
    .map((r) => ({ msg: r.data as AgentMessage, createdAt: r.createdAt }));

  const notifications = await getWebhookNotifications(conversationId);
  const webhookMessages = notifications.map((n) => ({
    msg: { role: "user", content: formatWebhookMessage(n) } as AgentMessage,
    createdAt: n.receivedAt,
  }));

  return [...baseMessages, ...webhookMessages]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((x) => x.msg);
}
