import type { Message } from "discord.js";

/**
 * Resolve a display name from a Discord message.
 * Much simpler than Slack — Discord provides names directly on the Message object.
 */
export function resolveDiscordUsername(message: Message): string {
  return message.member?.displayName ?? message.author.displayName ?? message.author.username;
}
