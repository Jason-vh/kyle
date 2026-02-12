import { WebClient } from "@slack/web-api";
import { createLogger } from "../logger.ts";

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

export async function setThreadStatus(
  channelId: string,
  threadTs: string,
  status: string,
): Promise<void> {
  try {
    const slack = getSlackClient();
    await slack.assistant.threads.setStatus({
      channel_id: channelId,
      thread_ts: threadTs,
      status,
    });
  } catch (error) {
    log.warn("failed to set thread status", {
      channelId,
      threadTs,
      status,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
