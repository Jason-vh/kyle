import { and, eq } from "drizzle-orm";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { AssistantMessage, ImageContent, Message, UserMessage } from "@earendil-works/pi-ai";
import {
  AssistantEntry,
  configure,
  ToolResultEntry,
  UserEntry,
  watchEvents,
  type Conversation,
  type EntryId,
  type Harness,
  type SettledSubmissionRecord,
  type Submission,
} from "@earendil-works/pi-durable";
import { createLogger } from "#server/logger.ts";
import { errorFields } from "#server/errors.ts";
import { db } from "#server/db/index.ts";
import { withDatabaseLock } from "#server/db/lock.ts";
import { conversations } from "#server/db/schema.ts";
import { loadLegacyHistory } from "#server/db/conversation-history.ts";
import { getHarness, RETRY_POLICY } from "#server/durable/harness.ts";
import { ApiOverloadedError, isOverloadedError } from "./errors.ts";
import { turnTools } from "./extension.ts";
import { model } from "./model.ts";
import { createProjection } from "./projection.ts";
import { toolsForTurn } from "./registry.ts";
import type { AgentContext } from "./system-prompt.ts";
import { writeTurnContext } from "./turn-context.ts";
import { createTurnEventTranslator, type TurnEvent } from "./turn-events.ts";

const log = createLogger("conversation");
const context = BACKGROUND_CONTEXT;

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
   * say — are still seen by the model, but kept out of `messages`, because the
   * event that caused them is already recorded in the thread.
   */
  storePrompt?: boolean;
  /**
   * Identifies the message across retries: a turn retried with the same key waits
   * for the one already submitted rather than running it again.
   */
  requestId?: string;
  context?: AgentContext;
  /** Platform-specific side effects (streaming, thread status, tables). */
  onEvent?: (event: TurnEvent) => void;
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
    if (
      !existing ||
      existing.interfaceType !== turn.interfaceType ||
      (turn.interfaceType === "http" && turn.appUserId && existing.userId !== turn.appUserId)
    )
      throw new ConversationNotFoundError(turn.conversationId);
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
    .onConflictDoNothing({ target: [conversations.externalId, conversations.interfaceType] })
    .returning();
  if (created) return created.id;
  const existing = await db.query.conversations.findFirst({
    where: and(
      eq(conversations.externalId, turn.externalId!),
      eq(conversations.interfaceType, turn.interfaceType),
    ),
  });
  return existing!.id;
}

function entryTokenFor(message: Message) {
  if (message.role === "user") return UserEntry;
  if (message.role === "assistant") return AssistantEntry;
  return ToolResultEntry;
}

/**
 * The durable conversation behind a Kyle conversation, created on first use. A
 * conversation from before pi-durable brings its history along, in the same
 * commit, and marks it as already copied to `messages`.
 */
async function durableConversation(
  harness: Harness,
  conversationId: string,
): Promise<Conversation> {
  const [row] = await db
    .select({ durableId: conversations.durableConversationId })
    .from(conversations)
    .where(eq(conversations.id, conversationId));
  if (row?.durableId != null) {
    const existing = await harness.conversation(row.durableId as Conversation["id"], context);
    if (existing) return existing;
  }

  const history = await loadLegacyHistory(conversationId);
  let imported = 0;
  const created = await harness.createConversation(
    {
      ownership: { kind: "ownerless" },
      init: async (tx, id) => {
        for (const message of history) {
          const token = entryTokenFor(message);
          const draft =
            token === ToolResultEntry
              ? { model: [message], data: { diagnostics: [] } }
              : { model: [message] };
          imported = (await tx.appendEntry(id, { kind: token.kind, ...draft })).id;
        }
      },
    },
    context,
  );
  await db
    .update(conversations)
    .set({ durableConversationId: created.id, durableProjectedThrough: imported })
    .where(eq(conversations.id, conversationId));
  log.info("durable conversation created", {
    conversationId,
    durableConversationId: created.id,
    importedMessages: history.length,
  });
  return created;
}

function userContent(turn: ConversationTurn): UserMessage["content"] {
  const text = turn.text || "[shared an image]";
  if (!turn.images?.length) return text;
  return [{ type: "text", text }, ...turn.images];
}

async function answerText(durable: Conversation, answer: EntryId): Promise<string> {
  const { items } = await durable.entries(
    { order: "ascending", minEntryId: answer, maxEntryId: answer },
    1,
    undefined,
    context,
  );
  const message = items[0]?.model?.[0] as AssistantMessage | undefined;
  return (message?.content ?? [])
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("");
}

function failure(settled: Extract<SettledSubmissionRecord, { status: "unanswered" }>): Error {
  const detail = typeof settled.detail === "string" ? settled.detail : undefined;
  if (isOverloadedError(detail)) return new ApiOverloadedError();
  return new Error(`Turn went unanswered (${settled.reason})${detail ? `: ${detail}` : ""}`);
}

/**
 * Submits the turn's input, or finds it submitted already. A request whose earlier
 * attempt went unanswered is submitted afresh, under a key derived from that
 * attempt, so a retry after a failure runs once more rather than never.
 */
async function submitTurn(
  durable: Conversation,
  content: UserMessage["content"],
  requestId: string | undefined,
): Promise<Submission> {
  let key = requestId;
  while (true) {
    const submission = await durable.submit({ type: "input", content, requestId: key }, context);
    if (key === undefined) return submission;
    const record = await submission.status(context);
    if (record.status !== "unanswered") return submission;
    key = `${requestId}#after-${record.id}`;
  }
}

/**
 * Runs one agent turn for a conversation: resolves the conversation, hands the
 * input to its durable transcript, and copies what the turn adds to `messages`.
 */
export async function runConversationTurn(turn: ConversationTurn): Promise<ConversationTurnResult> {
  const conversationId = await resolveConversationId(turn);
  return withDatabaseLock(`conversation:${conversationId}`, () => runTurn(turn, conversationId));
}

async function runTurn(
  turn: ConversationTurn,
  conversationId: string,
): Promise<ConversationTurnResult> {
  const harness = await getHarness();
  const durable = await durableConversation(harness, conversationId);

  // The tools need to know which conversation they act in, and for whom.
  const agentContext: AgentContext = { ...turn.context, conversationId };
  const offered = (await toolsForTurn(agentContext)).map((tool) => turnTools.get(tool.name)!);
  await durable.commit(async (tx) => {
    await writeTurnContext(tx, durable.id, agentContext);
    await configure(tx, durable.id, {
      model: { provider: model.provider, modelId: model.id },
      thinkingLevel: "off",
      tools: offered,
    });
  }, context);

  log.info("running agent", {
    conversationId,
    durableConversationId: durable.id,
    interfaceType: turn.interfaceType,
    externalId: turn.externalId,
    username: agentContext.username,
    imageCount: turn.images?.length ?? 0,
  });

  let submission: Promise<Submission> | undefined;
  const projection = createProjection({
    conversationId,
    durable,
    platformUserId: turn.platformUserId ?? null,
    appUserId: turn.appUserId ?? null,
    hiddenEntry:
      turn.storePrompt === false
        ? async () => (await (await submission!).status(context)).entry
        : undefined,
  });

  const translate = createTurnEventTranslator(RETRY_POLICY.maxRetries);
  const events = await watchEvents(harness, durable.id, context);
  events.start(async (batch) => {
    for (const event of batch) {
      if (event.type === "message_end" || event.type === "entry_appended") projection.sync();
      for (const turnEvent of translate(event)) {
        try {
          turn.onEvent?.(turnEvent);
        } catch (error) {
          log.error("turn event handler failed", { conversationId, ...errorFields(error) });
        }
      }
    }
  });

  try {
    submission = submitTurn(durable, userContent(turn), turn.requestId);
    const settled = await (await submission).wait(context);
    if (settled.status === "unanswered") throw failure(settled);

    const responseText =
      settled.type === "input" && settled.answer !== undefined
        ? await answerText(durable, settled.answer)
        : "";
    log.info("agent completed", { conversationId, responseLength: responseText.length });
    return { conversationId, responseText };
  } finally {
    await events.stop();
    // Even a failed turn keeps what it managed to say.
    projection.sync();
    const stored = await projection.flush();
    log.info("turn persisted", { conversationId, messages: stored });
  }
}
