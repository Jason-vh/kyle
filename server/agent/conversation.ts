import { and, eq } from "drizzle-orm";
import type { AgentEvent } from "@mariozechner/pi-agent-core";
import type { ImageContent } from "@mariozechner/pi-ai";
import { createLogger } from "../logger.ts";
import { db } from "../db/index.ts";
import { conversations } from "../db/schema.ts";
import { loadConversationHistory } from "../db/conversation-history.ts";
import { createTurnWriter } from "./turn-writer.ts";
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

/**
 * Runs one agent turn for a conversation: resolves the conversation, replays its
 * history, and stores each message and media event as the agent produces it.
 */
export async function runConversationTurn(turn: ConversationTurn): Promise<ConversationTurnResult> {
  const conversationId = await resolveConversationId(turn);
  const history = await loadConversationHistory(conversationId);

  const writer = createTurnWriter({
    conversationId,
    platformUserId: turn.platformUserId ?? null,
    appUserId: turn.appUserId ?? null,
    storePrompt: turn.storePrompt !== false,
  });

  // The share tool needs to know which conversation it is sharing.
  const context = turn.context ? { ...turn.context, conversationId } : undefined;

  log.info("running agent", {
    conversationId,
    interfaceType: turn.interfaceType,
    externalId: turn.externalId,
    username: context?.username,
    imageCount: turn.images?.length ?? 0,
  });

  try {
    const result = await runAgent({
      message: turn.text || "[shared an image]",
      previousMessages: history.messages,
      context,
      images: turn.images,
      messageTimestamps: history.timestamps,
      onEvent: (event) => {
        writer.observe(event);
        turn.onEvent?.(event);
      },
      onRetry: turn.onRetry,
    });

    log.info("agent completed", {
      conversationId,
      responseLength: result.responseText.length,
    });

    return { conversationId, responseText: result.responseText };
  } finally {
    // Even a failed turn keeps what it managed to say.
    const stored = await writer.flush();
    log.info("turn persisted", { conversationId, messages: stored });
  }
}
