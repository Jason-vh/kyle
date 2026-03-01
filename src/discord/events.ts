import { ChannelType, MessageFlags, type Message, type SendableChannels } from "discord.js";
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

const log = createLogger("discord");

const DISCORD_MAX_LENGTH = 2000;

/**
 * Strip bot @mention from message text and trim.
 */
function cleanDiscordMessage(text: string): string {
  if (!BOT_USER_ID) return text.trim();
  return text.replace(new RegExp(`<@!?${BOT_USER_ID}>`, "g"), "").trim();
}

/**
 * Split a response into chunks that fit within Discord's 2000-character limit.
 * Splits on newlines to avoid breaking mid-line.
 */
function splitResponse(text: string): string[] {
  if (text.length <= DISCORD_MAX_LENGTH) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= DISCORD_MAX_LENGTH) {
      chunks.push(remaining);
      break;
    }

    let splitAt = remaining.lastIndexOf("\n", DISCORD_MAX_LENGTH);
    if (splitAt <= 0) {
      splitAt = DISCORD_MAX_LENGTH;
    }

    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).replace(/^\n/, "");
  }

  return chunks;
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
  if (!messageText) return;

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
    userId,
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

    // Look up existing conversation
    const existing = await db.query.conversations.findFirst({
      where: and(
        eq(conversations.externalId, externalId),
        eq(conversations.interfaceType, "discord"),
      ),
    });

    if (existing) {
      conversationId = existing.id;
      previousMessages = await loadConversationHistory(conversationId);
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
          metadata,
        })
        .returning();
      conversationId = conversation!.id;
    }

    // Attach conversationId to agent context for share tool
    agentContext.conversationId = conversationId;

    // Run the agent
    log.info("running agent", {
      conversationId,
      externalId,
      message: messageText,
      username,
    });
    const result = await runAgent(messageText, previousMessages, agentContext, onEvent);
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
            userId: m.role === "user" ? userId : null,
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
      saveMediaRef(conversationId, toolCallId, ref, userId, messageId);
    }

    // Reply (split into multiple messages if needed)
    for (const chunk of splitResponse(result.responseText)) {
      await replyChannel.send({ content: chunk, flags: MessageFlags.SuppressEmbeds });
    }
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
