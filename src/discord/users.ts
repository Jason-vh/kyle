import type { Message } from "discord.js";
import { getDiscordClient } from "./client.ts";
import { createLogger } from "../logger.ts";

const log = createLogger("discord-users");

/**
 * Resolve a display name from a Discord message.
 * Much simpler than Slack — Discord provides names directly on the Message object.
 */
export function resolveDiscordUsername(message: Message): string {
  return message.member?.displayName ?? message.author.displayName ?? message.author.username;
}

/**
 * Batch-resolve Discord user IDs to display names.
 * Falls back to raw IDs if the Discord client isn't available.
 */
export async function resolveDiscordUsernames(userIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const client = getDiscordClient();

  for (const id of userIds) {
    if (!client) {
      map.set(id, id);
      continue;
    }
    try {
      const user = await client.users.fetch(id);
      map.set(id, user.displayName ?? user.username);
    } catch (err) {
      log.warn("failed to resolve discord user", {
        userId: id,
        error: err instanceof Error ? err.message : String(err),
      });
      map.set(id, id);
    }
  }

  return map;
}
