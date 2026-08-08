import { and, eq } from "drizzle-orm";
import type { AgentEvent, AgentMessage } from "@mariozechner/pi-agent-core";
import type { ImageContent } from "@mariozechner/pi-ai";
import { createLogger } from "../logger.ts";
import { db } from "../db/index.ts";
import { conversations, messages } from "../db/schema.ts";
import { loadConversationHistory } from "../db/conversation-history.ts";
import { extractMediaEvent, saveMediaEvent, type MediaEventData } from "../db/media-events.ts";
import { processMediaEvent } from "../db/subscriptions.ts";
import { runAgent, type AgentContext } from "./index.ts";

const log = createLogger("conversation");

export type InterfaceType = "slack" | "discord" | "http";

export interface ConversationTurn {
  interfaceType: InterfaceType;
  /** Existing conversation to continue; takes precedence over `externalId`. */
  conversationId?: string;
  /** Stable platform key (channel/thread) used to find or create the conversation. */
  externalId?: string;
  /** Stored only when the conversation is created. */
  metadata?: Record<string, unknown>;
  platformUserId?: string | null;
  appUserId?: string | null;
  text: string;
  images?: ImageContent[];
  /**
   * Whether to store the prompt itself. Turns the user did not type — a webhook,
   * say — are replayed to the model but not stored, because the event that caused
   * them is already recorded in the thread.
   */
  storePrompt?: boolean;
  context?: AgentContext;
  /** Platform-specific side effects (streaming, thread status, tables). */
  onEvent?: (event: AgentEvent) => void;
  onRetry?: (attempt: number, maxAttempts: number) => void;
}

export interface ConversationTurnResult {
  conversationId: string;
  responseText: string;
}

export class ConversationNotFoundError extends Error {
  constructor(conversationId: string) {
    super(`Conversation ${conversationId} not found`);
    this.name = "ConversationNotFoundError";
  }
}

async function resolveConversationId(turn: ConversationTurn): Promise<string> {
  if (turn.conversationId) {
    const existing = await db.query.conversations.findFirst({
      where: eq(conversations.id, turn.conversationId),
    });
    if (!existing) throw new ConversationNotFoundError(turn.conversationId);
    return existing.id;
  }

  if (turn.externalId) {
    const existing = await db.query.conversations.findFirst({
      where: and(
        eq(conversations.externalId, turn.externalId),
        eq(conversations.interfaceType, turn.interfaceType),
      ),
    });
    if (existing) return existing.id;
  }

  const [created] = await db
    .insert(conversations)
    .values({
      externalId: turn.externalId ?? null,
      interfaceType: turn.interfaceType,
      platformUserId: turn.platformUserId ?? null,
      userId: turn.appUserId ?? null,
      metadata: turn.metadata ?? null,
    })
    .returning();
  return created!.id;
}

/** Collects media events during a turn; they need message IDs that only exist after persisting. */
function createMediaEventCollector() {
  const toolArgs = new Map<string, Record<string, unknown>>();
  const pending: Array<{ toolCallId: string; event: MediaEventData }> = [];

  return {
    pending,
    observe(event: AgentEvent) {
      if (event.type === "tool_execution_start" && event.args) {
        toolArgs.set(event.toolCallId, event.args);
        return;
      }
      if (event.type !== "tool_execution_end" || event.isError) return;

      const args = toolArgs.get(event.toolCallId) ?? {};
      toolArgs.delete(event.toolCallId);
      const mediaEvent = extractMediaEvent(event.toolName, args, event.result);
      if (mediaEvent) pending.push({ toolCallId: event.toolCallId, event: mediaEvent });
    },
  };
}

/** Persists new messages and maps each tool call back to the message that made it. */
async function persistMessages(
  conversationId: string,
  newMessages: AgentMessage[],
  platformUserId: string | null,
  appUserId: string | null,
): Promise<Map<string, string>> {
  const toolCallToMessage = new Map<string, string>();
  if (newMessages.length === 0) return toolCallToMessage;

  const rows = await db
    .insert(messages)
    .values(
      newMessages.map((m) => ({
        conversationId,
        role: m.role,
        platformUserId: m.role === "user" ? platformUserId : null,
        userId: m.role === "user" ? appUserId : null,
        data: m,
      })),
    )
    .returning({ id: messages.id, role: messages.role, data: messages.data });

  for (const row of rows) {
    if (row.role !== "assistant") continue;
    const data = row.data as { content?: Array<{ type: string; id?: string }> };
    for (const block of data.content ?? []) {
      if (block.type === "toolCall" && block.id) toolCallToMessage.set(block.id, row.id);
    }
  }

  return toolCallToMessage;
}

/**
 * Runs one agent turn for a conversation: resolves the conversation, replays its
 * history, persists the new messages, and records any media events the agent caused.
 */
export async function runConversationTurn(turn: ConversationTurn): Promise<ConversationTurnResult> {
  const conversationId = await resolveConversationId(turn);
  const platformUserId = turn.platformUserId ?? null;
  const appUserId = turn.appUserId ?? null;

  const history = await loadConversationHistory(conversationId);
  const collector = createMediaEventCollector();

  // The share tool needs to know which conversation it is sharing.
  const context = turn.context ? { ...turn.context, conversationId } : undefined;

  log.info("running agent", {
    conversationId,
    interfaceType: turn.interfaceType,
    externalId: turn.externalId,
    username: context?.username,
    imageCount: turn.images?.length ?? 0,
  });

  const result = await runAgent({
    message: turn.text || "[shared an image]",
    previousMessages: history.messages,
    context,
    images: turn.images,
    messageTimestamps: history.timestamps,
    onEvent: (event) => {
      collector.observe(event);
      turn.onEvent?.(event);
    },
    onRetry: turn.onRetry,
  });

  log.info("agent completed", {
    conversationId,
    newMessages: result.messages.length - history.messages.length,
    errorMessages: result.errorMessages.length,
    responseLength: result.responseText.length,
  });

  const newMessages = result.messages.slice(history.messages.length);

  // Error messages are persisted too so the thread viewer can show what happened.
  const toolCallToMessage = await persistMessages(
    conversationId,
    [
      ...result.errorMessages,
      ...(turn.storePrompt === false ? newMessages.filter((m) => m.role !== "user") : newMessages),
    ],
    platformUserId,
    appUserId,
  );

  for (const { toolCallId, event } of collector.pending) {
    const messageId = toolCallToMessage.get(toolCallId);
    if (!messageId || !platformUserId) {
      log.error("cannot record media event", {
        toolCallId,
        title: event.title,
        hasMessageId: !!messageId,
        hasPlatformUserId: !!platformUserId,
      });
      continue;
    }
    await saveMediaEvent(conversationId, toolCallId, event, platformUserId, messageId, appUserId);
    await processMediaEvent(event, conversationId, appUserId);
  }

  return { conversationId, responseText: result.responseText };
}
