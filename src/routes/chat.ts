import { eq, asc } from "drizzle-orm";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { db } from "../db/index.ts";
import { conversations, messages } from "../db/schema.ts";
import { runAgent } from "../agent/index.ts";

interface ChatRequest {
  message: string;
  conversationId?: string;
  userId?: string;
}

export async function handleChat(req: Request): Promise<Response> {
  let body: ChatRequest;
  try {
    body = (await req.json()) as ChatRequest;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.message || typeof body.message !== "string") {
    return Response.json(
      { error: "message is required and must be a string" },
      { status: 400 }
    );
  }

  let conversationId = body.conversationId;
  let previousMessages: AgentMessage[] = [];

  if (conversationId) {
    // Load existing conversation
    const conversation = await db.query.conversations.findFirst({
      where: eq(conversations.id, conversationId),
    });

    if (!conversation) {
      return Response.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    // Load previous messages ordered by sequence
    const rows = await db.query.messages.findMany({
      where: eq(messages.conversationId, conversationId),
      orderBy: [asc(messages.sequence)],
    });

    previousMessages = rows.map((r) => r.data as AgentMessage);
  } else {
    // Create new conversation
    const [conversation] = await db
      .insert(conversations)
      .values({
        interfaceType: "http",
        userId: body.userId ?? null,
      })
      .returning();

    conversationId = conversation!.id;
  }

  // Run the agent
  let allMessages: AgentMessage[];
  let responseText: string;
  try {
    const result = await runAgent(body.message, previousMessages);
    allMessages = result.messages;
    responseText = result.responseText;
  } catch (error) {
    console.error("Agent error:", error);
    return Response.json(
      { error: "Failed to process message" },
      { status: 500 }
    );
  }

  // Persist only the new messages
  const newMessages = allMessages.slice(previousMessages.length);
  if (newMessages.length > 0) {
    const startSequence = previousMessages.length;
    await db.insert(messages).values(
      newMessages.map((m, i) => ({
        conversationId: conversationId!,
        role: m.role,
        sequence: startSequence + i,
        data: m,
      }))
    );
  }

  return Response.json({
    conversationId,
    response: responseText,
  });
}
