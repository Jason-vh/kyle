import type {
  AssistantMessage,
  ImageContent,
  TextContent,
  ToolResultMessage,
  UserMessage,
} from "@mariozechner/pi-ai";
import type { WebhookNotification } from "../db/webhook-notifications.ts";
import type { ThreadItem, ThreadMessage, ToolCallSummary } from "../../shared/types.ts";
import { toolSummary } from "./tool-summary.ts";

export type StoredMessage = UserMessage | AssistantMessage | ToolResultMessage;

export interface ThreadMessageRow {
  msg: StoredMessage;
  createdAt: Date;
  username: string;
}

export function extractTextContent(msg: UserMessage): string {
  if (typeof msg.content === "string") return msg.content;
  return msg.content
    .filter((c): c is TextContent => c.type === "text")
    .map((c) => c.text)
    .join(" ");
}

function extractImages(msg: UserMessage): { data: string; mimeType: string }[] | undefined {
  if (typeof msg.content === "string") return undefined;
  const images = msg.content
    .filter((c): c is ImageContent => c.type === "image")
    .map((c) => ({ data: c.data, mimeType: c.mimeType }));
  return images.length > 0 ? images : undefined;
}

export function stripMentions(text: string): string {
  return text.replace(/<@[A-Z0-9]+>/g, "").trim();
}

function prettyPrint(str: string): string {
  try {
    return JSON.stringify(JSON.parse(str), null, 2);
  } catch {
    return str;
  }
}

function resultText(result: ToolResultMessage): string {
  return prettyPrint(
    result.content
      .filter((c): c is TextContent => c.type === "text")
      .map((c) => c.text)
      .join("\n"),
  );
}

/** Turns an API error payload into something worth showing a person. */
function friendlyError(errorMessage: string | undefined): string {
  const fallback = "Something went wrong while processing this message.";
  if (!errorMessage) return fallback;
  try {
    const parsed = JSON.parse(errorMessage);
    if (parsed.error?.message) return parsed.error.message;
    if (typeof parsed.message === "string") return parsed.message;
    return fallback;
  } catch {
    return errorMessage.length < 200 ? errorMessage : fallback;
  }
}

function buildAssistantMessage(
  id: string,
  msg: AssistantMessage,
  createdAt: Date,
  results: Map<string, ToolResultMessage>,
): ThreadMessage {
  const message: ThreadMessage = {
    id,
    role: "assistant",
    createdAt: createdAt.toISOString(),
    username: "Kyle",
    stopReason: msg.stopReason,
  };

  if (msg.stopReason === "error") {
    message.errorMessage = friendlyError(msg.errorMessage);
    message.errorRaw = msg.errorMessage ? prettyPrint(msg.errorMessage) : undefined;
    message.hasErrors = true;
    return message;
  }

  const textParts: string[] = [];
  const toolCalls: ToolCallSummary[] = [];

  for (const block of msg.content) {
    if (block.type === "text") {
      if (block.text.trim()) textParts.push(block.text);
    } else if (block.type === "toolCall") {
      const result = results.get(block.id);
      toolCalls.push({
        id: block.id,
        name: block.name,
        summaryText: toolSummary(block),
        arguments: block.arguments,
        result: result ? { isError: result.isError ?? false, text: resultText(result) } : undefined,
      });
    }
  }

  message.textContent = textParts.length > 0 ? textParts.join("\n\n") : undefined;
  if (toolCalls.length > 0) {
    message.toolCalls = toolCalls;
    message.hasErrors = toolCalls.some((tc) => tc.result?.isError);
  }

  return message;
}

/**
 * Interleaves stored messages and webhook notifications by timestamp.
 * Tool results are folded into the tool calls that produced them.
 */
export function buildThreadItems(
  rows: ThreadMessageRow[],
  webhooks: WebhookNotification[],
): ThreadItem[] {
  const results = new Map<string, ToolResultMessage>();
  for (const { msg } of rows) {
    if (msg.role === "toolResult") results.set(msg.toolCallId, msg);
  }

  const timeline = [
    ...rows.map((row, index) => ({ kind: "message" as const, index, ts: row.createdAt.getTime() })),
    ...webhooks.map((n, index) => ({
      kind: "webhook" as const,
      index,
      ts: n.receivedAt.getTime(),
    })),
  ].sort((a, b) => a.ts - b.ts);

  const items: ThreadItem[] = [];
  let messageCount = 0;
  let webhookCount = 0;

  for (const entry of timeline) {
    if (entry.kind === "webhook") {
      const n = webhooks[entry.index]!;
      items.push({
        kind: "webhook",
        notification: {
          id: `webhook-${webhookCount++}`,
          source: n.source,
          receivedAt: n.receivedAt.toISOString(),
          payload: n.payload,
        },
      });
      continue;
    }

    const { msg, createdAt, username } = rows[entry.index]!;
    if (msg.role === "toolResult") continue;

    const id = `msg-${messageCount++}`;
    if (msg.role === "user") {
      items.push({
        kind: "message",
        message: {
          id,
          role: "user",
          createdAt: createdAt.toISOString(),
          username,
          textContent: extractTextContent(msg),
          images: extractImages(msg),
        },
      });
    } else {
      items.push({ kind: "message", message: buildAssistantMessage(id, msg, createdAt, results) });
    }
  }

  return items;
}
