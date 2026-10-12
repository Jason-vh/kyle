import { WebClient } from "@slack/web-api";
import { createLogger } from "#server/logger.ts";
import { errorMessage } from "#server/errors.ts";

const log = createLogger("slack:client");

let client: WebClient | null = null;

export function getSlackClient(): WebClient {
  if (!client) {
    const token = process.env.SLACK_BOT_TOKEN;
    if (!token) {
      throw new Error("SLACK_BOT_TOKEN environment variable is required");
    }
    client = new WebClient(token);
  }
  return client;
}

/** Where an agent session stands; `processing` shows Slack's "Working…" and stop button. */
export type SessionStatus = "processing" | "active";

export async function setSessionStatus(
  channelId: string,
  threadTs: string,
  status: SessionStatus,
): Promise<void> {
  try {
    await getSlackClient().agents.sessions.setStatus({
      channel_id: channelId,
      thread_ts: threadTs,
      status,
    });
  } catch (error) {
    log.warn("failed to set session status", {
      channelId,
      threadTs,
      status,
      error: errorMessage(error),
    });
  }
}
