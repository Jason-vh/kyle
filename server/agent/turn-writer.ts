import type { AgentEvent, AgentMessage } from "@mariozechner/pi-agent-core";
import { createLogger } from "../logger.ts";
import { errorMessage } from "../errors.ts";
import { db } from "../db/index.ts";
import { messages } from "../db/schema.ts";
import { extractMediaEvent, saveMediaEvent, type MediaEventData } from "../db/media-events.ts";
import { processMediaEvent } from "../db/subscriptions.ts";

const log = createLogger("conversation:writer");

export interface TurnWriterOptions {
  conversationId: string;
  platformUserId: string | null;
  appUserId: string | null;
  /** See `ConversationTurn.storePrompt`. */
  storePrompt: boolean;
}

export interface TurnWriter {
  /** Feed every agent event here; writes are queued, never awaited by the caller. */
  observe(event: AgentEvent): void;
  /** Waits for the queued writes and reports how many messages were stored. */
  flush(): Promise<number>;
}

/**
 * Persists a turn as it happens, so the thread viewer shows the conversation
 * progressing instead of nothing until the agent is done.
 *
 * Agent events arrive synchronously, so writes go onto a promise chain rather than
 * running concurrently: `messages.sequence` is an identity column, so overlapping
 * inserts would order the thread by whichever insert happened to land first.
 */
export function createTurnWriter(options: TurnWriterOptions): TurnWriter {
  const { conversationId, platformUserId, appUserId, storePrompt } = options;

  const toolArgs = new Map<string, Record<string, unknown>>();
  const messageIdByToolCall = new Map<string, string>();
  let queue: Promise<void> = Promise.resolve();
  let written = 0;

  /** A failed write must not take the turn down with it; the reply still matters. */
  function enqueue(what: string, run: () => Promise<void>): void {
    queue = queue.then(run).catch((error) => {
      log.error(`failed to persist ${what}`, { conversationId, error: errorMessage(error) });
    });
  }

  async function insertMessage(message: AgentMessage): Promise<void> {
    const isUser = message.role === "user";
    const [row] = await db
      .insert(messages)
      .values({
        conversationId,
        role: message.role,
        platformUserId: isUser ? platformUserId : null,
        userId: isUser ? appUserId : null,
        data: message,
      })
      .returning({ id: messages.id });
    written++;

    // Media events are attributed to the message whose tool call produced them.
    if (message.role !== "assistant") return;
    for (const block of message.content) {
      if (block.type === "toolCall") messageIdByToolCall.set(block.id, row!.id);
    }
  }

  async function insertMediaEvent(toolCallId: string, event: MediaEventData): Promise<void> {
    const messageId = messageIdByToolCall.get(toolCallId);
    if (!messageId || !platformUserId) {
      log.error("cannot record media event", {
        conversationId,
        toolCallId,
        title: event.title,
        hasMessageId: !!messageId,
        hasPlatformUserId: !!platformUserId,
      });
      return;
    }
    await saveMediaEvent(conversationId, toolCallId, event, platformUserId, messageId, appUserId);
    await processMediaEvent(event, conversationId, appUserId);
  }

  return {
    observe(event) {
      if (event.type === "message_end") {
        if (!storePrompt && event.message.role === "user") return;
        enqueue("message", () => insertMessage(event.message));
        return;
      }

      if (event.type === "tool_execution_start") {
        if (event.args) toolArgs.set(event.toolCallId, event.args);
        return;
      }

      if (event.type === "tool_execution_end") {
        const args = toolArgs.get(event.toolCallId) ?? {};
        toolArgs.delete(event.toolCallId);
        if (event.isError) return;

        const mediaEvent = extractMediaEvent(event.toolName, args, event.result);
        // Queued behind the message that made the call, whose id it needs.
        if (mediaEvent)
          enqueue("media event", () => insertMediaEvent(event.toolCallId, mediaEvent));
      }
    },

    async flush() {
      await queue;
      return written;
    },
  };
}
