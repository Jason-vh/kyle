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
let script: (options: RunAgentOptions) => RunAgentResult = () => {
  throw new Error("no script set");
};

mock.module("./index.ts", () => ({
  runAgent: async (options: RunAgentOptions) => script(options),
  ApiOverloadedError: class ApiOverloadedError extends Error {},
}));

const { runConversationTurn, ConversationNotFoundError } = await import("./conversation.ts");
const { db } = await import("../db/index.ts");
const { conversations, messages, mediaEvents, users } = await import("../db/schema.ts");

/** Mirrors the real agent: the returned history is the replayed messages plus the new turn. */
function assistantText(options: RunAgentOptions, text: string): RunAgentResult {
  return {
    messages: [
      ...(options.previousMessages ?? []),
      { role: "user", content: options.message },
      { role: "assistant", content: [{ type: "text", text }], stopReason: "endTurn" },
    ] as RunAgentResult["messages"],
    responseText: text,
    errorMessages: [],
  };
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

    script = (options) => {
      const emit = options.onEvent!;
      emit({
        type: "tool_execution_start",
        toolCallId,
        toolName: "add_movie",
        args: { tmdbId: 27205 },
      } as AgentEvent);
      emit({
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
          { role: "user", content: options.message },
          { role: "assistant", content: [toolCall], stopReason: "toolUse" },
          {
            role: "assistant",
            content: [{ type: "text", text: "Added it." }],
            stopReason: "endTurn",
          },
        ] as RunAgentResult["messages"],
        responseText: "Added it.",
        errorMessages: [],
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

  test("persists error messages so the thread viewer can show them", async () => {
    const errorMessage = {
      role: "assistant",
      content: [],
      stopReason: "error",
      errorMessage: "overloaded",
    } as unknown as RunAgentResult["errorMessages"][number];
    script = (options) => ({
      ...assistantText(options, "recovered"),
      errorMessages: [errorMessage],
    });

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
    expect(rows).toHaveLength(3);
    expect(rows[0]!.data).toMatchObject({ stopReason: "error" });
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

  test("rejects an unknown conversation id", async () => {
    script = (options) => assistantText(options, "never runs");
    expect(
      runConversationTurn({
        interfaceType: "http",
        conversationId: crypto.randomUUID(),
        text: "hi",
      }),
    ).rejects.toThrow(ConversationNotFoundError);
  });
});
