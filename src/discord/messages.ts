import { MessageFlags, type SendableChannels } from "discord.js";
import { createLogger } from "../logger.ts";
import { getDiscordClient } from "./client.ts";

const log = createLogger("discord");

const DISCORD_MAX_LENGTH = 2000;

/**
 * Split a response into chunks that fit within Discord's 2000-character limit.
 * Splits on newlines to avoid breaking mid-line.
 */
export function splitResponse(text: string): string[] {
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
 * Send a message to a Discord channel, splitting into multiple messages if needed.
 */
export async function sendDiscordMessage(channel: SendableChannels, text: string): Promise<void> {
  for (const chunk of splitResponse(text)) {
    await channel.send({ content: chunk, flags: MessageFlags.SuppressEmbeds });
  }
}

/**
 * Send a message to a Discord channel by ID, splitting into multiple messages if needed.
 * Returns false if the Discord client is unavailable or the channel is not sendable.
 */
export async function sendDiscordMessageToChannel(
  channelId: string,
  text: string,
): Promise<boolean> {
  const discord = getDiscordClient();
  if (!discord) {
    log.warn("discord client not available", { channelId });
    return false;
  }

  const channel = await discord.channels.fetch(channelId);
  if (!channel || !("send" in channel)) {
    log.warn("discord channel not sendable", { channelId });
    return false;
  }

  await sendDiscordMessage(channel as SendableChannels, text);
  return true;
}
