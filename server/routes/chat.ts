import { createLogger } from "../logger.ts";
import { ApiOverloadedError } from "../agent/index.ts";
import { runConversationTurn, ConversationNotFoundError } from "../agent/conversation.ts";
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

  try {
    const { conversationId, responseText } = await runConversationTurn({
      interfaceType: "http",
      conversationId: body.conversationId,
      platformUserId: body.userId,
      text: body.message,
    });
    return Response.json({ conversationId, response: responseText });
  } catch (error) {
    if (error instanceof ConversationNotFoundError) {
      return Response.json({ error: "Conversation not found" }, { status: 404 });
    }
    log.error("agent error", {
      conversationId: body.conversationId,
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
}
