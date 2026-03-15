import { Client, GatewayIntentBits, Partials } from "discord.js";
import { createLogger } from "../logger.ts";
import { handleDiscordMessage } from "./events.ts";

const log = createLogger("discord");

let client: Client | null = null;
export let BOT_USER_ID: string | null = null;

/**
 * Connect to Discord Gateway and register event handlers.
 * Skips gracefully if DISCORD_BOT_TOKEN is not set.
 */
export function startDiscordBot(): void {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    log.info("DISCORD_BOT_TOKEN not set, skipping Discord bot");
    return;
  }

  client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel],
  });

  client.on("clientReady", (c) => {
    BOT_USER_ID = c.user.id;
    log.info("discord bot ready", { username: c.user.tag, userId: BOT_USER_ID });
  });

  client.on("messageCreate", (message) => {
    handleDiscordMessage(message).catch((error) => {
      log.error("unhandled error in discord message handler", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    });
  });

  client.login(token).catch((error) => {
    log.error("failed to connect to Discord", {
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

/**
 * Get the logged-in Discord client instance.
 * Returns null when DISCORD_BOT_TOKEN is not configured.
 */
export function getDiscordClient(): Client | null {
  return client;
}
