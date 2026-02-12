import { eq, and, asc } from "drizzle-orm";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { createLogger } from "../logger.ts";
import { db } from "../db/index.ts";
import { conversations, messages } from "../db/schema.ts";
import { runAgent, toolLabels, type AgentContext } from "../agent/index.ts";
import { extractMediaRef, saveMediaRef } from "../db/media-refs.ts";
import { verifySlackSignature } from "../slack/verify.ts";
import { getSlackClient, setThreadStatus } from "../slack/client.ts";
import {
  type SlackEventPayload,
  shouldProcess,
  cleanMessageText,
} from "../slack/events.ts";
import { extractUserIds, resolveUsernames } from "../slack/users.ts";

const log = createLogger("slack");

// Dedup: track recently seen event IDs
const seenEvents = new Set<string>();
const MAX_SEEN = 10_000;

function trackEvent(eventId: string): boolean {
  if (seenEvents.has(eventId)) return false;
  if (seenEvents.size >= MAX_SEEN) seenEvents.clear();
  seenEvents.add(eventId);
  return true;
}

export async function handleSlackEvents(req: Request): Promise<Response> {
  const rawBody = await req.text();

  // Verify signature
  const timestamp = req.headers.get("x-slack-request-timestamp");
  const signature = req.headers.get("x-slack-signature");
  const valid = await verifySlackSignature(rawBody, timestamp, signature);
  if (!valid) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payload: SlackEventPayload = JSON.parse(rawBody);

  // URL verification challenge
  if (payload.type === "url_verification") {
    return Response.json({ challenge: payload.challenge });
  }

  // Skip retries
  if (req.headers.get("x-slack-retry-num")) {
    return new Response("ok", { status: 200 });
  }

  // Dedup
  if (payload.event_id && !trackEvent(payload.event_id)) {
    return new Response("ok", { status: 200 });
  }

  const event = payload.event;
  if (
    event &&
    (event.type === "message" || event.type === "app_mention") &&
    shouldProcess(event)
  ) {
    log.info("processing slack message", {
      channel: event.channel,
      eventType: event.type,
      threadTs: event.thread_ts,
    });

    const syncResponse = req.headers.get("x-sync-response") === "true";

    if (syncResponse) {
      // Wait for processing and return response in body
      const responseText = await processSlackMessage(event.text!, event.channel, event.ts, event.thread_ts, event.user);
      return Response.json({ ok: true, response: responseText });
    }

    // Ack immediately, process async
    processSlackMessage(event.text!, event.channel, event.ts, event.thread_ts, event.user);
  }

  return new Response("ok", { status: 200 });
}

async function processSlackMessage(
  rawText: string,
  channel: string,
  ts: string,
  threadTs?: string,
  userId?: string,
): Promise<string> {
  const slack = getSlackClient();
  const replyThreadTs = threadTs ?? ts;
  const externalId = `${channel}:${replyThreadTs}`;

  // Resolve @mentions to display names
  const mentionedIds = extractUserIds(rawText);
  const usernameMap = mentionedIds.length > 0
    ? await resolveUsernames(mentionedIds)
    : undefined;
  const messageText = cleanMessageText(rawText, usernameMap);

  if (!messageText) return "";

  // Build agent context from the sending user
  let agentContext: AgentContext | undefined;
  if (userId) {
    const senderMap = usernameMap?.has(userId)
      ? usernameMap
      : await resolveUsernames([userId]);
    agentContext = {
      username: senderMap.get(userId),
      userId,
    };
  }

  // Set initial thinking status
  setThreadStatus(channel, replyThreadTs, "is thinking...");

  let conversationId: string;

  // Build event handler for tool status updates + media ref saving
  const toolArgs = new Map<string, Record<string, unknown>>();
  const onEvent = (event: { type: string; toolCallId?: string; toolName?: string; args?: unknown; result?: unknown; isError?: boolean }) => {
    if (event.type === "tool_execution_start" && event.toolName) {
      const label = toolLabels.get(event.toolName);
      if (label) {
        setThreadStatus(channel, replyThreadTs, label);
      }
      if (event.toolCallId && event.args) {
        toolArgs.set(event.toolCallId, event.args as Record<string, unknown>);
      }
    }
    if (event.type === "tool_execution_end" && event.toolName && event.toolCallId && !event.isError) {
      const args = toolArgs.get(event.toolCallId) ?? {};
      toolArgs.delete(event.toolCallId);
      const ref = extractMediaRef(event.toolName, args, event.result as { content?: Array<{ type: string; text?: string }> });
      if (ref) {
        saveMediaRef(conversationId, event.toolCallId, ref);
      }
    }
  };

  try {
    let previousMessages: AgentMessage[] = [];

    // Look up existing conversation
    const existing = await db.query.conversations.findFirst({
      where: and(
        eq(conversations.externalId, externalId),
        eq(conversations.interfaceType, "slack")
      ),
    });

    if (existing) {
      conversationId = existing.id;
      const rows = await db.query.messages.findMany({
        where: eq(messages.conversationId, conversationId),
        orderBy: [asc(messages.sequence)],
      });
      previousMessages = rows.map((r) => r.data as AgentMessage);
    } else {
      const [conversation] = await db
        .insert(conversations)
        .values({
          externalId,
          interfaceType: "slack",
          metadata: { channel, threadTs: replyThreadTs },
        })
        .returning();
      conversationId = conversation!.id;
    }

    // Run the agent
    log.info("running agent", { conversationId, externalId, message: messageText, username: agentContext?.username });
    const result = await runAgent(messageText, previousMessages, agentContext, onEvent);
    log.info("agent completed", {
      conversationId,
      externalId,
      newMessages: result.messages.length - previousMessages.length,
      responseLength: result.responseText.length,
    });

    // Persist new messages
    const newMessages = result.messages.slice(previousMessages.length);
    if (newMessages.length > 0) {
      const startSequence = previousMessages.length;
      await db.insert(messages).values(
        newMessages.map((m, i) => ({
          conversationId,
          role: m.role,
          sequence: startSequence + i,
          data: m,
        }))
      );
    }

    // Reply in thread
    await slack.chat.postMessage({
      channel,
      thread_ts: replyThreadTs,
      text: result.responseText,
    });
    log.info("slack reply sent", { channel, threadTs: replyThreadTs, conversationId });
    return result.responseText;
  } catch (error) {
    log.error("slack message processing failed", {
      channel,
      threadTs: replyThreadTs,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    try {
      await slack.chat.postMessage({
        channel,
        thread_ts: replyThreadTs,
        text: "Sorry, something went wrong processing your message.",
      });
    } catch (postError) {
      log.error("failed to post error message to slack", {
        error: postError instanceof Error ? postError.message : String(postError),
      });
    }
    return "";
  } finally {
    setThreadStatus(channel, replyThreadTs, "");
  }
}
