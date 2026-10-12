import { eq, asc } from "drizzle-orm";
import type { AssistantMessage, ImageContent, Message, TextContent } from "@earendil-works/pi-ai";
import { db } from "./index.ts";
import { messages } from "./schema.ts";
import { getWebhookNotifications, type WebhookNotification } from "./webhook-notifications.ts";

/** Images were never replayed to the model, so the history keeps only a placeholder for each. */
function stripImageData(message: Message): Message {
  if (message.role !== "user" || typeof message.content === "string") return message;
  if (!message.content.some((block) => block.type === "image")) return message;
  return {
    ...message,
    content: message.content.map((block): TextContent | ImageContent =>
      block.type === "image" ? { type: "text", text: "[image]" } : block,
    ),
  };
}

function formatWebhookMessage(n: WebhookNotification): string {
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

function isFailedReply(message: Message): boolean {
  return message.role === "assistant" && (message as AssistantMessage).stopReason === "error";
}

/**
 * The model's view of a conversation stored before pi-durable kept transcripts:
 * its messages, with webhook notifications placed where they arrived. Each message
 * is stamped with the time it was stored.
 */
export async function loadLegacyHistory(conversationId: string): Promise<Message[]> {
  const rows = await db.query.messages.findMany({
    where: eq(messages.conversationId, conversationId),
    orderBy: [asc(messages.sequence)],
  });
  const stored = rows
    .map((row) => ({ message: row.data as Message, at: row.createdAt }))
    .filter(({ message }) => !isFailedReply(message))
    .map(({ message, at }) => ({ ...stripImageData(message), timestamp: at.getTime() }));

  const notifications = (await getWebhookNotifications(conversationId)).map(
    (notification): Message => ({
      role: "user",
      content: formatWebhookMessage(notification),
      timestamp: notification.receivedAt.getTime(),
    }),
  );

  return [...stored, ...notifications].sort((a, b) => a.timestamp - b.timestamp);
}
