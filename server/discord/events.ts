import { ChannelType, type Attachment, type Message, type SendableChannels } from "discord.js";
import { createLogger } from "../logger.ts";
import { ApiOverloadedError, type AgentContext } from "../agent/index.ts";
import { runConversationTurn } from "../agent/conversation.ts";
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

function conversationMetadata(
  message: Message,
  replyChannel: SendableChannels,
  { isDM, isThread }: { isDM: boolean; isThread: boolean },
): Record<string, unknown> {
  const metadata: Record<string, unknown> = { channelId: replyChannel.id, isDM };
  if (!isDM && message.guildId) metadata.guildId = message.guildId;
  if (isThread || (!isDM && replyChannel.id !== message.channelId)) {
    metadata.threadId = replyChannel.id;
  }
  return metadata;
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

  try {
    const images = imageAttachments.length > 0 ? await downloadDiscordImages(imageAttachments) : [];

    const { conversationId, responseText } = await runConversationTurn({
      interfaceType: "discord",
      externalId,
      metadata: conversationMetadata(message, replyChannel, { isDM, isThread }),
      platformUserId: userId,
      appUserId,
      text: messageText,
      images,
      context: agentContext,
    });

    // Reply (split into multiple messages if needed, guard against empty response)
    const replyText =
      responseText || "Sorry, I wasn't able to generate a response. Please try again.";
    await sendDiscordMessage(replyChannel, replyText);
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
