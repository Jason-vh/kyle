import { eq, and } from "drizzle-orm";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { createLogger } from "../logger.ts";
import { db } from "../db/index.ts";
import { conversations, messages } from "../db/schema.ts";
import { loadConversationHistory } from "../db/conversation-history.ts";
import { runAgent, toolLabels, ApiOverloadedError, type AgentContext } from "../agent/index.ts";
import { extractMediaEvent, saveMediaEvent, type MediaEventData } from "../db/media-events.ts";
import { processMediaEvent } from "../db/subscriptions.ts";
import { verifySlackSignature } from "../slack/verify.ts";
import { getSlackClient, setThreadStatus } from "../slack/client.ts";
import {
  type SlackEventPayload,
  type SlackFile,
  shouldProcess,
  cleanMessageText,
  getImageFiles,
} from "../slack/events.ts";
import { extractUserIds, resolveUsernames } from "../slack/users.ts";
import { resolveAppUserId } from "../db/users.ts";
import type { ImageContent } from "@mariozechner/pi-ai";

const log = createLogger("slack");

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB

async function downloadSlackImages(files: SlackFile[]): Promise<ImageContent[]> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return [];

  const results = await Promise.allSettled(
    files
      .filter((f) => !f.size || f.size <= MAX_IMAGE_SIZE)
      .map(async (f): Promise<ImageContent> => {
        const res = await fetch(f.url_private, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`Failed to download ${f.name}: ${res.status}`);
        const contentType = res.headers.get("content-type") ?? "";
        if (!contentType.startsWith("image/")) {
          throw new Error(
            `Expected image content-type for ${f.name}, got ${contentType} (bot may need files:read scope)`,
          );
        }
        const buffer = await res.arrayBuffer();
        const data = Buffer.from(buffer).toString("base64");
        return { type: "image", data, mimeType: f.mimetype };
      }),
  );

  const images: ImageContent[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") {
      images.push(r.value);
    } else {
      log.warn("failed to download slack image", { error: r.reason?.message ?? String(r.reason) });
    }
  }
  return images;
}

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
  if (event && (event.type === "message" || event.type === "app_mention") && shouldProcess(event)) {
    log.info("processing slack message", {
      channel: event.channel,
      eventType: event.type,
      threadTs: event.thread_ts,
    });

    const syncResponse = req.headers.get("x-sync-response") === "true";

    const imageFiles = getImageFiles(event.files);

    if (syncResponse) {
      // Wait for processing and return response in body
      const responseText = await processSlackMessage(
        event.text ?? "",
        event.channel,
        event.ts,
        event.thread_ts,
        event.user,
        imageFiles,
      );
      return Response.json({ ok: true, response: responseText });
    }

    // Ack immediately, process async
    processSlackMessage(
      event.text ?? "",
      event.channel,
      event.ts,
      event.thread_ts,
      event.user,
      imageFiles,
    );
  }

  return new Response("ok", { status: 200 });
}

async function processSlackMessage(
  rawText: string,
  channel: string,
  ts: string,
  threadTs?: string,
  userId?: string,
  imageFiles?: SlackFile[],
): Promise<string> {
  const slack = getSlackClient();
  const replyThreadTs = threadTs ?? ts;
  const externalId = `${channel}:${replyThreadTs}`;

  // Resolve @mentions to display names
  const mentionedIds = extractUserIds(rawText);
  const usernameMap = mentionedIds.length > 0 ? await resolveUsernames(mentionedIds) : undefined;
  const messageText = cleanMessageText(rawText, usernameMap);

  // Download images from Slack
  const images = imageFiles?.length ? await downloadSlackImages(imageFiles) : [];

  if (!messageText && images.length === 0) return "";

  // Resolve platform user to app user
  const appUserId = userId ? await resolveAppUserId("slack", userId) : null;

  // Build agent context from the sending user
  let agentContext: AgentContext | undefined;
  if (userId) {
    const senderMap = usernameMap?.has(userId) ? usernameMap : await resolveUsernames([userId]);
    agentContext = {
      username: senderMap.get(userId),
      userId: appUserId ?? undefined,
      interfaceType: "slack",
    };
  }

  // Set initial thinking status
  setThreadStatus(channel, replyThreadTs, "is thinking...");

  let conversationId: string;

  // Build event handler for tool status updates + deferred media ref collection
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
    if (event.type === "tool_execution_start" && event.toolName) {
      const label = toolLabels.get(event.toolName);
      if (label) {
        setThreadStatus(channel, replyThreadTs, label);
      }
      if (event.toolCallId && event.args) {
        toolArgs.set(event.toolCallId, event.args as Record<string, unknown>);
      }
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

  try {
    let previousMessages: AgentMessage[] = [];
    let messageTimestamps: WeakMap<object, Date> | undefined;

    // Look up existing conversation
    const existing = await db.query.conversations.findFirst({
      where: and(
        eq(conversations.externalId, externalId),
        eq(conversations.interfaceType, "slack"),
      ),
    });

    if (existing) {
      conversationId = existing.id;
      const history = await loadConversationHistory(conversationId);
      previousMessages = history.messages;
      messageTimestamps = history.timestamps;
    } else {
      const [conversation] = await db
        .insert(conversations)
        .values({
          externalId,
          interfaceType: "slack",
          platformUserId: userId ?? null,
          userId: appUserId,
          metadata: { channel, threadTs: replyThreadTs },
        })
        .returning();
      conversationId = conversation!.id;
    }

    // Attach conversationId to agent context for share tool
    if (agentContext) {
      agentContext.conversationId = conversationId;
    }

    // Run the agent
    log.info("running agent", {
      conversationId,
      externalId,
      message: messageText,
      username: agentContext?.username,
    });
    const result = await runAgent(
      messageText || "[shared an image]",
      previousMessages,
      agentContext,
      onEvent,
      (attempt, maxAttempts) => {
        setThreadStatus(channel, replyThreadTs, `is retrying... (${attempt}/${maxAttempts})`);
      },
      messageTimestamps,
      images.length > 0 ? images : undefined,
    );
    log.info("agent completed", {
      conversationId,
      externalId,
      newMessages: result.messages.length - previousMessages.length,
      errorMessages: result.errorMessages.length,
      responseLength: result.responseText.length,
    });

    // Persist error messages (for thread viewer visibility) then new messages
    const allNewMessages = [
      ...result.errorMessages,
      ...result.messages.slice(previousMessages.length),
    ];
    const toolCallToMsg = new Map<string, string>();
    if (allNewMessages.length > 0) {
      const insertedRows = await db
        .insert(messages)
        .values(
          allNewMessages.map((m) => ({
            conversationId,
            role: m.role,
            platformUserId: m.role === "user" ? (userId ?? null) : null,
            userId: m.role === "user" ? appUserId : null,
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
      if (!messageId) {
        log.error("no messageId found for pending media event", {
          toolCallId,
          title: mediaEvent.title,
        });
        continue;
      }
      saveMediaEvent(conversationId, toolCallId, mediaEvent, userId!, messageId, appUserId);
      processMediaEvent(mediaEvent, conversationId, appUserId);
    }

    // Reply in thread
    await slack.chat.postMessage({
      channel,
      thread_ts: replyThreadTs,
      text: result.responseText,
      unfurl_links: false,
      unfurl_media: false,
    });
    log.info("slack reply sent", { channel, threadTs: replyThreadTs, conversationId });
    return result.responseText;
  } catch (error) {
    const isOverloaded = error instanceof ApiOverloadedError;
    log.error("slack message processing failed", {
      channel,
      threadTs: replyThreadTs,
      isOverloaded,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    try {
      await slack.chat.postMessage({
        channel,
        thread_ts: replyThreadTs,
        text: isOverloaded
          ? "Sorry, I'm having trouble reaching my brain right now. Give me a minute and try again?"
          : "Sorry, something went wrong processing your message.",
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
