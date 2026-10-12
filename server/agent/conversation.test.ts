import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import {
  fauxAssistantMessage,
  fauxText,
  fauxToolCall,
  type FauxResponseFactory,
  type Message,
  type TranscriptContext,
} from "@earendil-works/pi-ai";
import { useFauxModel, useInstantRetries } from "./testing.ts";
import { runConversationTurn, ConversationNotFoundError } from "./conversation.ts";
import { ApiOverloadedError } from "./errors.ts";
import type { TurnEvent } from "./turn-events.ts";
import { db } from "#server/db/index.ts";
import { conversations, messages, mediaEvents, users } from "#server/db/schema.ts";
import { createTestUser, deleteTestUser } from "#server/db/testing.ts";

/** Runs real turns through pi-durable and Postgres; only the model is scripted. */

const faux = useFauxModel();

process.env.RADARR_HOST = "http://radarr.test";
process.env.RADARR_API_KEY = "k";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  faux.setResponses([]);
});

function conversationOf(context: TranscriptContext): Message[] {
  return context.messages.filter((message) => message.role !== "system");
}

function textOf(message: Message | undefined): string {
  if (!message || message.role === "toolResult") return "";
  if (typeof message.content === "string") return message.content;
  return message.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
}

/** Answers with `text`, after recording what the model was shown. */
function reply(text: string, seen?: (context: TranscriptContext) => void): FauxResponseFactory {
  return (context) => {
    seen?.(context);
    return fauxAssistantMessage(text);
  };
}

async function roles(conversationId: string): Promise<string[]> {
  const rows = await db
    .select({ role: messages.role })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.sequence);
  return rows.map((row) => row.role);
}

let appUserId: string;
const createdConversationIds: string[] = [];
const cleanupUsers: string[] = [];

beforeAll(async () => {
  const [user] = await db
    .insert(users)
    .values({ displayName: `test-${crypto.randomUUID().slice(0, 8)}` })
    .returning();
  appUserId = user!.id;
});

afterAll(async () => {
  await db.execute(sql`DELETE FROM movie_subscriptions WHERE user_id = ${appUserId}`);
  await db.execute(sql`DELETE FROM media_requests WHERE user_id = ${appUserId}`);
  for (const id of createdConversationIds) {
    await db.delete(conversations).where(eq(conversations.id, id));
  }
  await db.delete(users).where(eq(users.id, appUserId));
  for (const id of cleanupUsers) await deleteTestUser(id);
});

describe("runConversationTurn", () => {
  test("creates a conversation, then continues the same one by externalId", async () => {
    const externalId = `test:${crypto.randomUUID()}`;
    let shown: Message[] = [];
    faux.setResponses([
      reply("first reply"),
      reply("second reply", (c) => (shown = conversationOf(c))),
    ]);

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

    const second = await runConversationTurn({
      interfaceType: "slack",
      externalId,
      platformUserId: "U1",
      appUserId,
      text: "again",
    });
    expect(second.conversationId).toBe(first.conversationId);
    expect(second.responseText).toBe("second reply");
    expect(shown.map((message) => message.role)).toEqual(["user", "assistant", "user"]);
    // Each user message carries the time it was sent.
    expect(textOf(shown[2])).toMatch(/^\[\d{1,2}:\d{2} [AP]M [A-Z+\d:]+\] again$/);

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

  test("the system prompt is written for the turn's user and interface", async () => {
    let prompt = "";
    faux.setResponses([
      reply("hi", (context) => {
        prompt = JSON.stringify(context.messages.filter((m) => m.role === "system"));
      }),
    ]);
    const { conversationId } = await runConversationTurn({
      interfaceType: "discord",
      externalId: `test:${crypto.randomUUID()}`,
      appUserId,
      text: "hello",
      context: { username: "Ada", userId: appUserId, interfaceType: "discord" },
    });
    createdConversationIds.push(conversationId);
    expect(prompt).toContain("You are Kyle");
    expect(prompt).toContain("You are chatting with Ada");
    expect(prompt).toContain("You are posting in Discord");
  });

  test("concurrent turns share one conversation and run one after the other", async () => {
    const seen: number[] = [];
    faux.setResponses([
      reply("one", (c) => seen.push(conversationOf(c).length)),
      reply("two", (c) => seen.push(conversationOf(c).length)),
    ]);
    const turn = {
      interfaceType: "slack" as const,
      externalId: `test:${crypto.randomUUID()}`,
      text: "hello",
    };
    const results = await Promise.all([runConversationTurn(turn), runConversationTurn(turn)]);
    createdConversationIds.push(results[0]!.conversationId);

    expect(results[0]!.conversationId).toBe(results[1]!.conversationId);
    expect(seen).toEqual([1, 3]);
    expect(await roles(results[0]!.conversationId)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
    ]);
  });

  test("a failed turn keeps what happened and lets the next turn run", async () => {
    faux.setResponses([
      fauxAssistantMessage([], { stopReason: "error", errorMessage: "invalid request" }),
      reply("recovered"),
    ]);
    const turn = {
      interfaceType: "http" as const,
      externalId: `test:${crypto.randomUUID()}`,
      text: "hello",
    };
    await expect(runConversationTurn(turn)).rejects.toThrow("invalid request");
    const { conversationId, responseText } = await runConversationTurn(turn);
    createdConversationIds.push(conversationId);

    expect(responseText).toBe("recovered");
    expect(await roles(conversationId)).toEqual(["user", "assistant", "user", "assistant"]);
  });

  test("streams the reply and its tool calls to the interface", async () => {
    faux.setResponses([
      fauxAssistantMessage(
        [
          fauxToolCall("convert_time", {
            time: "8:00 PM",
            fromTimezone: "America/New_York",
            toTimezone: "Europe/Amsterdam",
            date: "2026-01-15",
          }),
        ],
        { stopReason: "toolUse" },
      ),
      fauxAssistantMessage([fauxText("2:00 AM in Amsterdam.")]),
    ]);
    const events: TurnEvent[] = [];
    const { conversationId, responseText } = await runConversationTurn({
      interfaceType: "slack",
      externalId: `test:${crypto.randomUUID()}`,
      appUserId,
      text: "what time is 8pm New York in Amsterdam?",
      context: { userId: appUserId },
      onEvent: (event) => events.push(event),
    });
    createdConversationIds.push(conversationId);

    expect(responseText).toBe("2:00 AM in Amsterdam.");
    expect(events.filter((e) => e.type === "tool_start").map((e) => e.toolName)).toEqual([
      "convert_time",
    ]);
    const end = events.find((e) => e.type === "tool_end");
    expect(end).toMatchObject({ toolName: "convert_time", isError: false });
    const streamed = events.flatMap((e) => (e.type === "text_delta" ? [e.delta] : [])).join("");
    expect(streamed).toBe("2:00 AM in Amsterdam.");
    expect(await roles(conversationId)).toEqual(["user", "assistant", "toolResult", "assistant"]);
  });

  test("tools are refused to a user who may not use them", async () => {
    faux.setResponses([
      fauxAssistantMessage([fauxToolCall("remove_movie", { movieId: 1 })], {
        stopReason: "toolUse",
      }),
      reply("done"),
    ]);
    const events: TurnEvent[] = [];
    const { conversationId } = await runConversationTurn({
      interfaceType: "http",
      text: "remove it",
      context: { userId: appUserId },
      onEvent: (event) => events.push(event),
    });
    createdConversationIds.push(conversationId);
    expect(events.find((e) => e.type === "tool_end")).toMatchObject({ isError: true });
  });

  test("permissions are read again when a tool runs, not when the turn starts", async () => {
    const adminId = await createTestUser("Demoted admin", true);
    cleanupUsers.push(adminId);
    faux.setResponses([
      async () => {
        // Demoted after the turn offered admin tools, before the model's call runs.
        await db.update(users).set({ isAdmin: false }).where(eq(users.id, adminId));
        return fauxAssistantMessage([fauxToolCall("remove_movie", { movieId: 1 })], {
          stopReason: "toolUse",
        });
      },
      reply("done"),
    ]);
    const events: TurnEvent[] = [];
    const { conversationId } = await runConversationTurn({
      interfaceType: "http",
      text: "remove it",
      context: { userId: adminId },
      onEvent: (event) => events.push(event),
    });
    createdConversationIds.push(conversationId);
    const end = events.find((e) => e.type === "tool_end");
    expect(end).toMatchObject({ isError: true });
    expect(JSON.stringify(end)).toContain("not authorized");
  });

  test("links a media event to the message that made the tool call", async () => {
    globalThis.fetch = ((url: string) => {
      const routes: Record<string, unknown> = {
        "/movie?tmdbId=": [],
        "/movie/lookup/tmdb": { title: "Inception", year: 2010 },
        "/qualityprofile": [{ id: 1 }],
        "/rootfolder": [{ path: "/movies" }],
        "/api/v3/movie": { title: "Inception", year: 2010, id: 42, titleSlug: "inception-2010" },
      };
      for (const [fragment, body] of Object.entries(routes)) {
        if (url.includes(fragment)) return Promise.resolve(Response.json(body));
      }
      return Promise.resolve(new Response("unexpected", { status: 500 }));
    }) as unknown as typeof fetch;
    faux.setResponses([
      fauxAssistantMessage([fauxToolCall("add_movie", { tmdbId: 27205 })], {
        stopReason: "toolUse",
      }),
      reply("Added it."),
    ]);

    const { conversationId } = await runConversationTurn({
      interfaceType: "discord",
      externalId: `test:${crypto.randomUUID()}`,
      platformUserId: "U2",
      appUserId,
      text: "add inception",
      context: { userId: appUserId },
    });
    createdConversationIds.push(conversationId);

    const [event] = await db
      .select()
      .from(mediaEvents)
      .where(eq(mediaEvents.conversationId, conversationId));
    expect(event).toMatchObject({
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
    const toolCallMessage = rows.find((r) => JSON.stringify(r.data).includes(event!.toolCallId));
    expect(toolCallMessage?.role).toBe("assistant");
    expect(event!.messageId).toBe(toolCallMessage!.id);
  });

  test("a prompt the user did not type is seen by the model but not stored", async () => {
    let shown: Message[] = [];
    faux.setResponses([
      reply("hello"),
      reply("your show finished downloading"),
      reply("you're welcome", (c) => (shown = conversationOf(c))),
    ]);
    const { conversationId } = await runConversationTurn({ interfaceType: "discord", text: "hi" });
    createdConversationIds.push(conversationId);
    await runConversationTurn({
      interfaceType: "discord",
      conversationId,
      text: "[Webhook — Sonarr] Severance has finished downloading.",
      storePrompt: false,
    });
    await runConversationTurn({ interfaceType: "discord", conversationId, text: "thanks" });

    expect(textOf(shown[2])).toContain("[Webhook — Sonarr] Severance has finished downloading.");
    expect(await roles(conversationId)).toEqual([
      "user",
      "assistant",
      "assistant",
      "user",
      "assistant",
    ]);
  });

  test("messages are stored while the turn is still running", async () => {
    let midRun: string[] = [];
    faux.setResponses([
      fauxAssistantMessage(
        [fauxToolCall("convert_time", { time: "8:00 PM", fromTimezone: "UTC", toTimezone: "UTC" })],
        {
          stopReason: "toolUse",
        },
      ),
      async () => {
        for (let attempt = 0; attempt < 100 && midRun.length < 3; attempt++) {
          midRun = await roles(conversationId!);
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        return fauxAssistantMessage("done");
      },
    ]);
    let conversationId: string | undefined;
    const externalId = `test:${crypto.randomUUID()}`;
    const [created] = await db
      .insert(conversations)
      .values({ externalId, interfaceType: "http" })
      .returning();
    conversationId = created!.id;
    createdConversationIds.push(conversationId);

    await runConversationTurn({
      interfaceType: "http",
      conversationId,
      text: "what time is it",
      context: { userId: appUserId },
    });
    expect(midRun).toEqual(["user", "assistant", "toolResult"]);
  });

  test("a conversation from before pi-durable brings its history", async () => {
    const [created] = await db.insert(conversations).values({ interfaceType: "http" }).returning();
    const conversationId = created!.id;
    createdConversationIds.push(conversationId);
    const stored = (role: string, data: object, minutesAgo: number) => ({
      conversationId,
      role,
      data: { role, ...data },
      createdAt: new Date(Date.now() - minutesAgo * 60_000),
    });
    const storedReply = (content: object[], extra: object) => ({
      content,
      api: "anthropic-messages",
      provider: "anthropic",
      model: "claude-sonnet-4-5",
      usage: fauxAssistantMessage("").usage,
      timestamp: 0,
      ...extra,
    });
    await db
      .insert(messages)
      .values([
        stored("user", { content: "remember Amsterdam", timestamp: 0 }, 10),
        stored(
          "assistant",
          storedReply([{ type: "text", text: "noted" }], { stopReason: "stop" }),
          9,
        ),
        stored("assistant", storedReply([], { stopReason: "error", errorMessage: "boom" }), 8),
      ]);

    let shown: Message[] = [];
    faux.setResponses([reply("Amsterdam", (c) => (shown = conversationOf(c)))]);
    await runConversationTurn({ interfaceType: "http", conversationId, text: "which city?" });

    // The failed reply was never part of what the model saw, and still is not.
    expect(shown.map(textOf).map((text) => text.replace(/^\[[^\]]+\] /, ""))).toEqual([
      "remember Amsterdam",
      "noted",
      "which city?",
    ]);
    expect(await roles(conversationId)).toEqual([
      "user",
      "assistant",
      "assistant",
      "user",
      "assistant",
    ]);
  });

  test("a retried request waits for the turn already submitted", async () => {
    faux.setResponses([reply("only once")]);
    const turn = {
      interfaceType: "slack" as const,
      externalId: `test:${crypto.randomUUID()}`,
      text: "hello",
      requestId: "slack:1.1",
    };
    const first = await runConversationTurn(turn);
    createdConversationIds.push(first.conversationId);
    const again = await runConversationTurn(turn);

    expect(again.responseText).toBe("only once");
    expect(faux.getPendingResponseCount()).toBe(0);
    expect(await roles(first.conversationId)).toEqual(["user", "assistant"]);
  });

  test("a request that failed is tried again under the same key", async () => {
    faux.setResponses([
      fauxAssistantMessage([], { stopReason: "error", errorMessage: "invalid request" }),
      reply("second time lucky"),
    ]);
    const turn = {
      interfaceType: "slack" as const,
      externalId: `test:${crypto.randomUUID()}`,
      text: "hello",
      requestId: "slack:2.2",
    };
    await expect(runConversationTurn(turn)).rejects.toThrow("invalid request");
    const again = await runConversationTurn(turn);
    createdConversationIds.push(again.conversationId);
    expect(again.responseText).toBe("second time lucky");
  });

  test("an overloaded model is retried, and the interface hears about each retry", async () => {
    const restore = useInstantRetries();
    const overloaded = () =>
      fauxAssistantMessage([], {
        stopReason: "error",
        errorMessage: "529 overloaded_error: Overloaded",
      });
    faux.setResponses([overloaded(), reply("made it on the second try")]);
    const events: TurnEvent[] = [];
    try {
      const { conversationId, responseText } = await runConversationTurn({
        interfaceType: "slack",
        text: "hello",
        onEvent: (event) => events.push(event),
      });
      createdConversationIds.push(conversationId);
      expect(responseText).toBe("made it on the second try");
      expect(events.filter((e) => e.type === "retry")).toEqual([
        { type: "retry", attempt: 1, maxAttempts: 2 },
      ]);
    } finally {
      restore();
    }
  });

  test("a model still overloaded after every retry fails the turn as overloaded", async () => {
    const restore = useInstantRetries();
    const overloaded = () =>
      fauxAssistantMessage([], {
        stopReason: "error",
        errorMessage: "529 overloaded_error: Overloaded",
      });
    faux.setResponses([overloaded(), overloaded(), overloaded()]);
    try {
      await expect(runConversationTurn({ interfaceType: "http", text: "hello" })).rejects.toThrow(
        ApiOverloadedError,
      );
      expect(faux.getPendingResponseCount()).toBe(0);
    } finally {
      restore();
    }
  });

  test("rejects an unknown conversation id", async () => {
    await expect(
      runConversationTurn({
        interfaceType: "http",
        conversationId: crypto.randomUUID(),
        text: "hi",
      }),
    ).rejects.toThrow(ConversationNotFoundError);
  });
});
