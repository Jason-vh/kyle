import { eq, asc } from "drizzle-orm";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { createLogger } from "../logger.ts";
import { db } from "../db/index.ts";
import { conversations, messages } from "../db/schema.ts";
import { runAgent, ApiOverloadedError } from "../agent/index.ts";
import type { AssistantMessage } from "@mariozechner/pi-ai";
import { extractMediaEvent, saveMediaEvent, type MediaEventData } from "../db/media-events.ts";
import { processMediaEvent } from "../db/subscriptions.ts";
import { timingSafeEqual } from "crypto";

const log = createLogger("chat");

interface ChatRequest {
  message: string;
  conversationId?: string;
  userId?: string;
}

export async function handleChat(req: Request): Promise<Response> {
  // Bearer token auth (optional — only enforced when CHAT_API_KEY is set)
  const apiKey = process.env.CHAT_API_KEY;
  if (apiKey) {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      log.warn("missing or malformed Authorization header");
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.slice("Bearer ".length);
    const tokenBuf = Buffer.from(token);
    const keyBuf = Buffer.from(apiKey);
    if (tokenBuf.length !== keyBuf.length || !timingSafeEqual(tokenBuf, keyBuf)) {
      log.warn("invalid bearer token");
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let body: ChatRequest;
  try {
    body = (await req.json()) as ChatRequest;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.message || typeof body.message !== "string") {
    return Response.json({ error: "message is required and must be a string" }, { status: 400 });
  }

  let conversationId = body.conversationId;
  let previousMessages: AgentMessage[] = [];
  let messageTimestamps: WeakMap<object, Date> | undefined;

  if (conversationId) {
    // Load existing conversation
    const conversation = await db.query.conversations.findFirst({
      where: eq(conversations.id, conversationId),
    });

    if (!conversation) {
      return Response.json({ error: "Conversation not found" }, { status: 404 });
    }

    // Load previous messages ordered by sequence
    const rows = await db.query.messages.findMany({
      where: eq(messages.conversationId, conversationId),
      orderBy: [asc(messages.sequence)],
    });

    const timestamps = new WeakMap<object, Date>();
    previousMessages = rows
      .map((r) => {
        const msg = r.data as AgentMessage;
        timestamps.set(msg, r.createdAt);
        return msg;
      })
      .filter((m) => !(m.role === "assistant" && (m as AssistantMessage).stopReason === "error"));
    messageTimestamps = timestamps;
  } else {
    // Create new conversation
    const [conversation] = await db
      .insert(conversations)
      .values({
        interfaceType: "http",
      })
      .returning();

    conversationId = conversation!.id;
  }

  // Build event handler for deferred media ref collection
  const toolArgs = new Map<string, Record<string, unknown>>();
  const pendingEvents: Array<{ toolCallId: string; event: MediaEventData }> = [];
  const onEvent = (event: {
    type: string;
    toolCallId?: string;
    toolName?: string;
    args?: unknown;
    result?: unknown;
    isError?: boolean;
  }) => {
    if (event.type === "tool_execution_start" && event.toolCallId && event.args) {
      toolArgs.set(event.toolCallId, event.args as Record<string, unknown>);
    }
    if (
      event.type === "tool_execution_end" &&
      event.toolName &&
      event.toolCallId &&
      !event.isError
    ) {
      const args = toolArgs.get(event.toolCallId) ?? {};
      toolArgs.delete(event.toolCallId);
      const mediaEvent = extractMediaEvent(
        event.toolName,
        args,
        event.result as { content?: Array<{ type: string; text?: string }> },
      );
      if (mediaEvent) {
        pendingEvents.push({ toolCallId: event.toolCallId, event: mediaEvent });
      }
    }
  };

  // Run the agent
  let allMessages: AgentMessage[];
  let responseText: string;
  let errorMessages: AgentMessage[];
  try {
    const result = await runAgent(
      body.message,
      previousMessages,
      undefined,
      onEvent,
      undefined,
      messageTimestamps,
    );
    allMessages = result.messages;
    responseText = result.responseText;
    errorMessages = result.errorMessages;
  } catch (error) {
    log.error("agent error", {
      conversationId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    if (error instanceof ApiOverloadedError) {
      return Response.json(
        { error: "The AI service is currently overloaded. Please try again in a moment." },
        { status: 503 },
      );
    }
    return Response.json({ error: "Failed to process message" }, { status: 500 });
  }

  // Persist error messages (for thread viewer visibility) then new messages
  const allNewMessages = [...errorMessages, ...allMessages.slice(previousMessages.length)];
  const toolCallToMsg = new Map<string, string>();
  if (allNewMessages.length > 0) {
    const insertedRows = await db
      .insert(messages)
      .values(
        allNewMessages.map((m) => ({
          conversationId: conversationId!,
          role: m.role,
          platformUserId: m.role === "user" ? (body.userId ?? null) : null,
          data: m,
        })),
      )
      .returning({ id: messages.id, role: messages.role, data: messages.data });

    for (const row of insertedRows) {
      if (row.role === "assistant") {
        const data = row.data as { content?: Array<{ type: string; id?: string }> };
        for (const block of data.content ?? []) {
          if (block.type === "toolCall" && block.id) {
            toolCallToMsg.set(block.id, row.id);
          }
        }
      }
    }
  }

  // Save deferred media events with messageId + process subscriptions
  for (const { toolCallId, event: mediaEvent } of pendingEvents) {
    const messageId = toolCallToMsg.get(toolCallId);
    if (!messageId || !body.userId) {
      log.error("missing messageId or userId for pending media event", {
        toolCallId,
        title: mediaEvent.title,
        hasMessageId: !!messageId,
        hasUserId: !!body.userId,
      });
      continue;
    }
    saveMediaEvent(conversationId!, toolCallId, mediaEvent, body.userId, messageId);
    processMediaEvent(mediaEvent, conversationId!, null);
  }

  return Response.json({
    conversationId,
    response: responseText,
  });
}
