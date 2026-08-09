import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import type { AgentEvent } from "@mariozechner/pi-agent-core";
import type { RunAgentOptions, RunAgentResult } from "./index.ts";

/**
 * Exercises the real persistence path against a live database.
 * Run `bun run db:up && bun run db:migrate` first; skipped when unreachable.
 */

const dbReachable = await (async () => {
  if (!process.env.DATABASE_URL) return false;
  const { checkDatabaseHealth } = await import("../db/index.ts");
  return checkDatabaseHealth();
})();

if (!dbReachable) {
  console.warn("skipping conversation integration tests: DATABASE_URL is unset or unreachable");
}

// The agent itself is scripted; this suite is about what happens around it.
let script: (options: RunAgentOptions) => RunAgentResult | Promise<RunAgentResult> = () => {
  throw new Error("no script set");
};

mock.module("./index.ts", () => ({
  runAgent: async (options: RunAgentOptions) => script(options),
  ApiOverloadedError: class ApiOverloadedError extends Error {},
}));

const { runConversationTurn, ConversationNotFoundError } = await import("./conversation.ts");
const { db } = await import("../db/index.ts");
const { conversations, messages, mediaEvents, users } = await import("../db/schema.ts");

type NewMessages = RunAgentResult["messages"];

/**
 * Mirrors the real agent: every new message is announced with `message_end` as it
 * is produced, and the returned history is the replayed messages plus the new turn.
 * Persistence is driven by those events, so a script that skips them stores nothing.
 */
function emit(options: RunAgentOptions, newMessages: NewMessages): NewMessages {
  for (const message of newMessages) {
    options.onEvent?.({ type: "message_end", message } as AgentEvent);
  }
  return [...(options.previousMessages ?? []), ...newMessages];
}

function assistantText(options: RunAgentOptions, text: string): RunAgentResult {
  const messages = emit(options, [
    { role: "user", content: options.message },
    { role: "assistant", content: [{ type: "text", text }], stopReason: "stop" },
  ] as NewMessages);
  return { messages, responseText: text };
}

/** Writes are queued off the agent's synchronous events, so wait for them to land. */
async function rolesAfter(conversationId: string, expected: number): Promise<string[]> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const rows = await db
      .select({ role: messages.role })
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.sequence);
    if (rows.length >= expected) return rows.map((r) => r.role);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`timed out waiting for ${expected} messages`);
}

let appUserId: string;
const externalId = `test:${crypto.randomUUID()}`;
const createdConversationIds: string[] = [];

beforeAll(async () => {
  if (!dbReachable) return;
  const [user] = await db
    .insert(users)
    .values({ displayName: `test-${crypto.randomUUID().slice(0, 8)}` })
    .returning();
  appUserId = user!.id;
});

afterAll(async () => {
  if (!dbReachable) return;
  await db.execute(sql`DELETE FROM movie_subscriptions WHERE user_id = ${appUserId}`);
  for (const id of createdConversationIds) {
    await db.delete(conversations).where(eq(conversations.id, id));
  }
  await db.delete(users).where(eq(users.id, appUserId));
});

describe.skipIf(!dbReachable)("runConversationTurn", () => {
  test("creates a conversation, then continues the same one by externalId", async () => {
    script = (options) => assistantText(options, "first reply");
    const first = await runConversationTurn({
      interfaceType: "slack",
      externalId,
      metadata: { channel: "C1", threadTs: "1.1" },
      platformUserId: "U1",
      appUserId,
      text: "hello",
    });
    createdConversationIds.push(first.conversationId);

    expect(first.responseText).toBe("first reply");

    let replayed: number | undefined;
    script = (options) => {
      replayed = options.previousMessages?.length;
      return assistantText(options, "second reply");
    };
    const second = await runConversationTurn({
      interfaceType: "slack",
      externalId,
      platformUserId: "U1",
      appUserId,
      text: "again",
    });

    expect(second.conversationId).toBe(first.conversationId);
    expect(replayed).toBe(2); // the first turn's user + assistant messages

    const conversation = await db.query.conversations.findFirst({
      where: eq(conversations.id, first.conversationId),
    });
    expect(conversation).toMatchObject({
      externalId,
      interfaceType: "slack",
      platformUserId: "U1",
      userId: appUserId,
      metadata: { channel: "C1", threadTs: "1.1" },
    });

    const rows = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, first.conversationId))
      .orderBy(messages.sequence);
    expect(rows.map((r) => r.role)).toEqual(["user", "assistant", "user", "assistant"]);
    // Author columns are set on user messages only.
    expect(rows[0]).toMatchObject({ platformUserId: "U1", userId: appUserId });
    expect(rows[1]).toMatchObject({ platformUserId: null, userId: null });
  });

  test("links a media event to the message that made the tool call and subscribes the user", async () => {
    const toolCallId = `call-${crypto.randomUUID().slice(0, 8)}`;
    const toolCall = {
      type: "toolCall" as const,
      id: toolCallId,
      name: "add_movie",
      arguments: { tmdbId: 27205 },
    };

    // Ordered as the real agent does it: the tool call is announced before it runs.
    script = (options) => {
      const fire = options.onEvent!;
      const messages = emit(options, [
        { role: "user", content: options.message },
        { role: "assistant", content: [toolCall], stopReason: "toolUse" },
      ] as NewMessages);

      fire({
        type: "tool_execution_start",
        toolCallId,
        toolName: "add_movie",
        args: { tmdbId: 27205 },
      } as AgentEvent);
      fire({
        type: "tool_execution_end",
        toolCallId,
        toolName: "add_movie",
        isError: false,
        result: {
          content: [
            {
              type: "text",
              text: JSON.stringify({ title: "Inception", id: 42, titleSlug: "inception-2010" }),
            },
          ],
        },
      } as AgentEvent);

      return {
        messages: [
          ...messages,
          ...emit({ ...options, previousMessages: [] }, [
            {
              role: "assistant",
              content: [{ type: "text", text: "Added it." }],
              stopReason: "stop",
            },
          ] as NewMessages),
        ],
        responseText: "Added it.",
      };
    };

    const { conversationId } = await runConversationTurn({
      interfaceType: "discord",
      externalId: `test:${crypto.randomUUID()}`,
      platformUserId: "U2",
      appUserId,
      text: "add inception",
    });
    createdConversationIds.push(conversationId);

    const [event] = await db
      .select()
      .from(mediaEvents)
      .where(eq(mediaEvents.conversationId, conversationId));
    expect(event).toMatchObject({
      toolCallId,
      action: "add",
      mediaType: "movie",
      title: "Inception",
      platformUserId: "U2",
      userId: appUserId,
      ids: { tmdb: 27205, radarr: 42, titleSlug: "inception-2010" },
    });

    // The event points at the assistant message that actually issued the tool call.
    const rows = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.sequence);
    const toolCallMessage = rows.find((r) => JSON.stringify(r.data).includes(`"${toolCallId}"`));
    expect(toolCallMessage).toBeDefined();
    expect(event!.messageId).toBe(toolCallMessage!.id);

    const subscriptions = await db.execute(
      sql`SELECT radarr_id, active FROM movie_subscriptions WHERE user_id = ${appUserId}`,
    );
    expect([...subscriptions]).toEqual([{ radarr_id: 42, active: true }]);
  });

  test("persists a failed attempt so the thread viewer can show it", async () => {
    // A retried turn announces the failed attempt, then the recovery.
    script = (options) => {
      const failed = emit(options, [
        { role: "user", content: options.message },
        { role: "assistant", content: [], stopReason: "error", errorMessage: "overloaded" },
      ] as NewMessages);
      const recovered = emit({ ...options, previousMessages: [] }, [
        { role: "assistant", content: [{ type: "text", text: "recovered" }], stopReason: "stop" },
      ] as NewMessages);
      return { messages: [...failed, ...recovered], responseText: "recovered" };
    };

    const { conversationId } = await runConversationTurn({
      interfaceType: "http",
      text: "hi",
    });
    createdConversationIds.push(conversationId);

    const rows = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.sequence);
    // Stored in the order they happened, failed attempt included.
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.role)).toEqual(["user", "assistant", "assistant"]);
    expect(rows[1]!.data).toMatchObject({ stopReason: "error" });
    expect(rows[2]!.data).toMatchObject({ stopReason: "stop" });
  });

  test("a prompt the user did not type is replayed but not stored", async () => {
    script = (options) => assistantText(options, "it's ready");
    const { conversationId } = await runConversationTurn({
      interfaceType: "discord",
      text: "hello",
    });
    createdConversationIds.push(conversationId);

    let replayed: string[] | undefined;
    script = (options) => {
      replayed = options.previousMessages?.map((m) => m.role);
      return assistantText(options, "your show finished downloading");
    };
    await runConversationTurn({
      interfaceType: "discord",
      conversationId,
      text: "[Webhook — Sonarr] Severance has finished downloading.",
      storePrompt: false,
    });

    expect(replayed).toEqual(["user", "assistant"]);

    const rows = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.sequence);
    expect(rows.map((r) => r.role)).toEqual(["user", "assistant", "assistant"]);
  });

  test("messages are stored while the turn is still running", async () => {
    script = (options) => assistantText(options, "hello");
    const { conversationId } = await runConversationTurn({ interfaceType: "http", text: "first" });
    createdConversationIds.push(conversationId);

    let midRun: string[] = [];
    script = async (options) => {
      const sofar = emit(options, [
        { role: "user", content: options.message },
        { role: "assistant", content: [{ type: "text", text: "thinking" }], stopReason: "toolUse" },
      ] as NewMessages);
      // The agent has not returned yet, but the turn so far should already be readable.
      midRun = await rolesAfter(conversationId, 4);
      return {
        messages: [
          ...sofar,
          ...emit({ ...options, previousMessages: [] }, [
            { role: "assistant", content: [{ type: "text", text: "done" }], stopReason: "stop" },
          ] as NewMessages),
        ],
        responseText: "done",
      };
    };

    await runConversationTurn({ interfaceType: "http", conversationId, text: "second" });

    expect(midRun).toEqual(["user", "assistant", "user", "assistant"]);
    expect(await rolesAfter(conversationId, 5)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
      "assistant",
    ]);
  });

  test("a turn that fails part-way keeps what already happened", async () => {
    script = (options) => {
      emit(options, [
        { role: "user", content: options.message },
        { role: "assistant", content: [], stopReason: "error", errorMessage: "overloaded" },
      ] as NewMessages);
      throw new Error("API is overloaded after retries");
    };

    const conversationId = crypto.randomUUID();
    await db.insert(conversations).values({ id: conversationId, interfaceType: "http" });
    createdConversationIds.push(conversationId);

    await expect(
      runConversationTurn({ interfaceType: "http", conversationId, text: "hi" }),
    ).rejects.toThrow("overloaded");

    expect(await rolesAfter(conversationId, 2)).toEqual(["user", "assistant"]);
  });

  test("rejects an unknown conversation id", async () => {
    script = (options) => assistantText(options, "never runs");
    await expect(
      runConversationTurn({
        interfaceType: "http",
        conversationId: crypto.randomUUID(),
        text: "hi",
      }),
    ).rejects.toThrow(ConversationNotFoundError);
  });
});
