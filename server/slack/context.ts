import { createLogger } from "../logger.ts";
import { getSlackClient } from "./client.ts";

const log = createLogger("slack:context");

/** What the user is looking at, sent by Slack when the app has agent_view enabled. */
export interface AppContext {
  entities?: Array<{ type: string; value: string }>;
}

const CHANNEL_ENTITY = "slack#/types/channel_id";

const channelNames = new Map<string, string | null>();

/**
 * Describe what the user is currently viewing, for the agent's system prompt.
 *
 * Entities are ordered by relevance, so only the first recognised one is used.
 * Channel names need the `channels:read` scope; without it the context is
 * dropped rather than passed along as an opaque ID the agent can't use.
 */
export async function describeAppContext(context?: AppContext): Promise<string | undefined> {
  const entity = context?.entities?.find((e) => e.type === CHANNEL_ENTITY);
  if (!entity) return undefined;

  const name = await resolveChannelName(entity.value);
  return name ? `the #${name} channel` : undefined;
}

async function resolveChannelName(channelId: string): Promise<string | undefined> {
  const cached = channelNames.get(channelId);
  if (cached !== undefined) return cached ?? undefined;

  try {
    const response = await getSlackClient().conversations.info({ channel: channelId });
    const name = response.channel?.name;
    channelNames.set(channelId, name ?? null);
    return name;
  } catch (error) {
    // Usually a missing scope; not worth failing the message over.
    channelNames.set(channelId, null);
    log.warn("could not resolve channel name for app context", {
      channelId,
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}
