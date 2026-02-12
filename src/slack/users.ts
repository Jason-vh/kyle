import { getSlackClient } from "./client.ts";
import { BOT_USER_ID } from "./events.ts";
import { createLogger } from "../logger.ts";

const log = createLogger("slack:users");

export function extractUserIds(text: string): string[] {
  const matches = text.matchAll(/<@([A-Z0-9]+)>/g);
  return [...new Set([...matches].map((m) => m[1]!))];
}

export async function resolveUsernames(
  userIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const slack = getSlackClient();

  for (const id of userIds) {
    if (id === BOT_USER_ID) {
      map.set(id, "Kyle");
      continue;
    }
    try {
      const result = await slack.users.info({ user: id });
      const profile = result.user?.profile;
      const name =
        profile?.display_name ||
        result.user?.real_name ||
        result.user?.name ||
        id;
      map.set(id, name);
    } catch (error) {
      log.warn("failed to resolve user", {
        userId: id,
        error: error instanceof Error ? error.message : String(error),
      });
      map.set(id, id);
    }
  }

  return map;
}
