import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { AssistantMessage, Message, ToolResultMessage } from "@earendil-works/pi-ai";
import {
  AssistantEntry,
  ToolResultEntry,
  UserEntry,
  type Conversation,
  type Cursor,
  type EntryId,
  type EntryRecord,
} from "@earendil-works/pi-durable";
import { and, eq, sql } from "drizzle-orm";
import { db } from "#server/db/index.ts";
import { conversations, messages } from "#server/db/schema.ts";
import { extractMediaEvent, saveMediaEvent, type MediaEventData } from "#server/db/media-events.ts";
import { processMediaEvent } from "#server/db/subscriptions.ts";
import { errorMessage } from "#server/errors.ts";
import { createLogger } from "#server/logger.ts";

const log = createLogger("conversation:projection");

const PAGE_SIZE = 100;

export interface ProjectionOptions {
  conversationId: string;
  durable: Conversation;
  platformUserId: string | null;
  appUserId: string | null;
  /** The user entry to leave out, for a prompt nobody typed; see `ConversationTurn.storePrompt`. */
  hiddenEntry?: () => Promise<EntryId | undefined>;
}

export interface Projection {
  /** Copies whatever the transcript gained since the last pass; passes run one at a time. */
  sync(): void;
  /** Waits for the passes asked for so far, and reports how many messages they stored. */
  flush(): Promise<number>;
}

interface ToolCallOrigin {
  messageId: string;
  toolName: string;
  args: Record<string, unknown>;
}

/**
 * Keeps `messages` a copy of the durable transcript, for the thread viewer, media
 * events, and subscriptions. Entries are copied in order and past a stored cursor,
 * so a pass that is repeated, or comes after a restart, stores each message once.
 */
export function createProjection(options: ProjectionOptions): Projection {
  const { conversationId, durable, platformUserId, appUserId } = options;
  const origins = new Map<string, ToolCallOrigin>();
  let queue: Promise<void> = Promise.resolve();
  let stored = 0;

  async function newEntries(after: number): Promise<EntryRecord[]> {
    const entries: EntryRecord[] = [];
    let cursor: Cursor | undefined;
    do {
      const page = await durable.entries(
        { order: "ascending", minEntryId: (after + 1) as EntryId },
        PAGE_SIZE,
        cursor,
        BACKGROUND_CONTEXT,
      );
      entries.push(...page.items);
      cursor = page.next;
    } while (cursor);
    return entries;
  }

  async function isHidden(entry: EntryRecord): Promise<boolean> {
    if (!options.hiddenEntry || !UserEntry.is(entry)) return false;
    return entry.id === (await options.hiddenEntry());
  }

  async function storedMessage(entry: EntryRecord): Promise<Message | undefined> {
    const isMessage = UserEntry.is(entry) || AssistantEntry.is(entry) || ToolResultEntry.is(entry);
    if (!isMessage || (await isHidden(entry))) return undefined;
    return entry.model?.[0];
  }

  async function originOf(toolCallId: string): Promise<ToolCallOrigin | undefined> {
    const known = origins.get(toolCallId);
    if (known) return known;
    const [row] = await db
      .select({ id: messages.id, data: messages.data })
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, conversationId),
          eq(messages.role, "assistant"),
          sql`${messages.data}->'content' @> ${JSON.stringify([{ type: "toolCall", id: toolCallId }])}::jsonb`,
        ),
      )
      .limit(1);
    if (!row) return undefined;
    remember(row.id, row.data as AssistantMessage);
    return origins.get(toolCallId);
  }

  function remember(messageId: string, message: AssistantMessage): void {
    for (const block of message.content) {
      if (block.type !== "toolCall") continue;
      origins.set(block.id, { messageId, toolName: block.name, args: block.arguments });
    }
  }

  async function recordMediaEvent(result: ToolResultMessage): Promise<void> {
    if (result.isError) return;
    const origin = await originOf(result.toolCallId);
    if (!origin) return;
    const event = extractMediaEvent(origin.toolName, origin.args, result);
    if (!event) return;
    await storeMediaEvent(result.toolCallId, origin.messageId, event);
  }

  async function storeMediaEvent(
    toolCallId: string,
    messageId: string,
    event: MediaEventData,
  ): Promise<void> {
    if (!platformUserId) {
      log.error("cannot record media event without a platform user", {
        conversationId,
        toolCallId,
        title: event.title,
      });
      return;
    }
    await saveMediaEvent(conversationId, toolCallId, event, platformUserId, messageId, appUserId);
    await processMediaEvent(event, conversationId, appUserId);
  }

  async function pass(): Promise<void> {
    const [current] = await db
      .select({ through: conversations.durableProjectedThrough })
      .from(conversations)
      .where(eq(conversations.id, conversationId));
    if (!current) return;
    const entries = await newEntries(current.through);
    if (entries.length === 0) return;

    const pending: { entry: EntryRecord; message: Message }[] = [];
    for (const entry of entries) {
      const message = await storedMessage(entry);
      if (message) pending.push({ entry, message });
    }

    const inserted = await db.transaction(async (tx) => {
      const [locked] = await tx
        .select({ through: conversations.durableProjectedThrough })
        .from(conversations)
        .where(eq(conversations.id, conversationId))
        .for("update");
      const fresh = pending.filter(({ entry }) => entry.id > locked!.through);
      const rows = [];
      for (const { message } of fresh) {
        const isUser = message.role === "user";
        const [row] = await tx
          .insert(messages)
          .values({
            conversationId,
            role: message.role,
            platformUserId: isUser ? platformUserId : null,
            userId: isUser ? appUserId : null,
            data: message,
            createdAt: new Date(message.timestamp),
          })
          .returning({ id: messages.id });
        rows.push({ id: row!.id, message });
      }
      await tx
        .update(conversations)
        .set({ durableProjectedThrough: Math.max(locked!.through, entries.at(-1)!.id) })
        .where(eq(conversations.id, conversationId));
      return rows;
    });
    stored += inserted.length;

    for (const { id, message } of inserted) {
      if (message.role === "assistant") remember(id, message);
      if (message.role === "toolResult") await recordMediaEvent(message);
    }
  }

  return {
    sync() {
      // A failed pass must not take the turn down with it; the next one catches up.
      queue = queue.then(pass).catch((error) => {
        log.error("failed to copy the transcript", { conversationId, error: errorMessage(error) });
      });
    },
    async flush() {
      await queue;
      return stored;
    },
  };
}
