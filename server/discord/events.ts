import { ChannelType, type Attachment, type Message, type SendableChannels } from "discord.js";
import { eq, and } from "drizzle-orm";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { createLogger } from "../logger.ts";
import { db } from "../db/index.ts";
import { conversations, messages } from "../db/schema.ts";
import { loadConversationHistory } from "../db/conversation-history.ts";
import { runAgent, ApiOverloadedError, type AgentContext } from "../agent/index.ts";
import { extractMediaRef, saveMediaRef, type MediaRefData } from "../db/media-refs.ts";
import { BOT_USER_ID } from "./client.ts";
import { resolveDiscordUsername } from "./users.ts";
import { sendDiscordMessage } from "./messages.ts";
import { resolveAppUserId } from "../db/users.ts";
import type { ImageContent } from "@mariozechner/pi-ai";

const log = createLogger("discord");

const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB

function getImageAttachments(attachments: Message["attachments"]): Attachment[] {
  return [...attachments.values()].filter(
    (a) => a.contentType && SUPPORTED_IMAGE_TYPES.has(a.contentType) && a.size <= MAX_IMAGE_SIZE,
  );
}

async function downloadDiscordImages(attachments: Attachment[]): Promise<ImageContent[]> {
  const results = await Promise.allSettled(
    attachments.map(async (a): Promise<ImageContent> => {
      const res = await fetch(a.url);
      if (!res.ok) throw new Error(`Failed to download ${a.name}: ${res.status}`);
      const buffer = await res.arrayBuffer();
      const data = Buffer.from(buffer).toString("base64");
      return { type: "image", data, mimeType: a.contentType! };
    }),
  );

  const images: ImageContent[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") {
      images.push(r.value);
    } else {
      log.warn("failed to download discord image", {
        error: r.reason?.message ?? String(r.reason),
      });
    }
  }
  return images;
}

/**
 * Strip bot @mention from message text and trim.
 */
function cleanDiscordMessage(text: string): string {
  if (!BOT_USER_ID) return text.trim();
  return text.replace(new RegExp(`<@!?${BOT_USER_ID}>`, "g"), "").trim();
}

/**
 * Main messageCreate handler — mirrors the Slack processSlackMessage flow.
 */
export async function handleDiscordMessage(message: Message): Promise<void> {
  // Skip bot messages
  if (message.author.bot) return;

  const isDM =
    message.channel.type === ChannelType.DM || message.channel.type === ChannelType.GroupDM;
  const isThread = message.channel.isThread();

  // In guild channels (not threads), require @mention
  if (!isDM && !isThread) {
    if (!BOT_USER_ID || !message.mentions.has(BOT_USER_ID)) return;
  }

  // In threads, only respond if the bot is mentioned or started the thread
  if (isThread && !isDM) {
    const starterMessage = await message.channel.fetchStarterMessage().catch(() => null);
    const botStartedThread = starterMessage?.author?.id === BOT_USER_ID;
    const botMentioned = BOT_USER_ID ? message.mentions.has(BOT_USER_ID) : false;
    if (!botStartedThread && !botMentioned) return;
  }

  const messageText = cleanDiscordMessage(message.content);
  const imageAttachments = getImageAttachments(message.attachments);
  if (!messageText && imageAttachments.length === 0) return;

  // Determine thread strategy and externalId
  let externalId: string;
  let replyChannel: SendableChannels;

  if (isDM) {
    externalId = `dm:${message.channelId}`;
    replyChannel = message.channel as SendableChannels;
  } else if (isThread) {
    externalId = `thread:${message.channelId}`;
    replyChannel = message.channel as SendableChannels;
  } else {
    // Guild channel @mention — create a thread
    const thread = await message.startThread({ name: messageText.slice(0, 100) });
    externalId = `thread:${thread.id}`;
    replyChannel = thread;
  }

  const username = resolveDiscordUsername(message);
  const userId = message.author.id;
  const appUserId = await resolveAppUserId("discord", userId);

  log.info("processing discord message", {
    externalId,
    isDM,
    isThread,
    username,
  });

  // Send typing indicator
  await replyChannel.sendTyping().catch(() => {});

  const agentContext: AgentContext = {
    username,
    userId: appUserId ?? undefined,
    interfaceType: "discord",
  };

  let conversationId: string;

  // Build event handler for deferred media ref collection
  const toolArgs = new Map<string, Record<string, unknown>>();
  const pendingRefs: Array<{ toolCallId: string; ref: MediaRefData }> = [];
  const onEvent = (event: {
    type: string;
    toolCallId?: string;
    toolName?: string;
    args?: unknown;
    result?: unknown;
    isError?: boolean;
  }) => {
    if (event.type === "tool_execution_start" && event.toolName) {
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
      const ref = extractMediaRef(
        event.toolName,
        args,
        event.result as { content?: Array<{ type: string; text?: string }> },
      );
      if (ref) {
        pendingRefs.push({ toolCallId: event.toolCallId, ref });
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
        eq(conversations.interfaceType, "discord"),
      ),
    });

    if (existing) {
      conversationId = existing.id;
      const history = await loadConversationHistory(conversationId);
      previousMessages = history.messages;
      messageTimestamps = history.timestamps;
    } else {
      const metadata: Record<string, unknown> = { channelId: replyChannel.id };
      if (!isDM && "guildId" in message && message.guildId) {
        metadata.guildId = message.guildId;
      }
      if (isThread || (!isDM && replyChannel.id !== message.channelId)) {
        metadata.threadId = replyChannel.id;
      }
      metadata.isDM = isDM;

      const [conversation] = await db
        .insert(conversations)
        .values({
          externalId,
          interfaceType: "discord",
          platformUserId: userId,
          userId: appUserId,
          metadata,
        })
        .returning();
      conversationId = conversation!.id;
    }

    // Attach conversationId to agent context for share tool
    agentContext.conversationId = conversationId;

    // Download images from Discord attachments
    const images = imageAttachments.length > 0 ? await downloadDiscordImages(imageAttachments) : [];

    // Run the agent
    log.info("running agent", {
      conversationId,
      externalId,
      message: messageText,
      username,
      imageCount: images.length,
    });
    const result = await runAgent(
      messageText || "[shared an image]",
      previousMessages,
      agentContext,
      onEvent,
      undefined,
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

    // Persist error messages then new messages
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
            platformUserId: m.role === "user" ? userId : null,
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

    // Save deferred media refs with messageId
    for (const { toolCallId, ref } of pendingRefs) {
      const messageId = toolCallToMsg.get(toolCallId);
      if (!messageId) {
        log.error("no messageId found for pending media ref", { toolCallId, title: ref.title });
        continue;
      }
      saveMediaRef(conversationId, toolCallId, ref, userId, messageId, appUserId);
    }

    // Reply (split into multiple messages if needed)
    await sendDiscordMessage(replyChannel, result.responseText);
    log.info("discord reply sent", { externalId, conversationId });
  } catch (error) {
    const isOverloaded = error instanceof ApiOverloadedError;
    log.error("discord message processing failed", {
      externalId,
      isOverloaded,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    try {
      await replyChannel.send(
        isOverloaded
          ? "Sorry, I'm having trouble reaching my brain right now. Give me a minute and try again?"
          : "Sorry, something went wrong processing your message.",
      );
    } catch (postError) {
      log.error("failed to post error message to discord", {
        error: postError instanceof Error ? postError.message : String(postError),
      });
    }
  }
}
