import { ChannelType, type Message, type SendableChannels } from "discord.js";
import { createLogger } from "../logger.ts";
import { type AgentContext } from "../agent/index.ts";
import { EMPTY_REPLY, failureReply } from "../agent/replies.ts";
import { runConversationTurn } from "../agent/conversation.ts";
import {
  downloadImages,
  MAX_IMAGE_SIZE,
  SUPPORTED_IMAGE_TYPES,
  type RemoteImage,
} from "../images.ts";
import { BOT_USER_ID } from "./client.ts";
import { resolveDiscordUsername } from "./users.ts";
import { sendDiscordMessage } from "./messages.ts";
import { resolveAppUserId } from "../db/users.ts";
import { errorFields } from "../errors.ts";

const log = createLogger("discord");

function toRemoteImages(attachments: Message["attachments"]): RemoteImage[] {
  return [...attachments.values()]
    .filter(
      (a) => a.contentType && SUPPORTED_IMAGE_TYPES.has(a.contentType) && a.size <= MAX_IMAGE_SIZE,
    )
    .map((a) => ({ name: a.name, url: a.url }));
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
  const remoteImages = toRemoteImages(message.attachments);
  if (!messageText && remoteImages.length === 0) return;

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
    const images = await downloadImages("discord", remoteImages);

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

    // Split into multiple messages if needed.
    await sendDiscordMessage(replyChannel, responseText || EMPTY_REPLY);
    log.info("discord reply sent", { externalId, conversationId });
  } catch (error) {
    log.error("discord message processing failed", { externalId, ...errorFields(error) });
    try {
      await replyChannel.send(failureReply(error));
    } catch (postError) {
      log.error("failed to post error message to discord", errorFields(postError));
    }
  }
}
