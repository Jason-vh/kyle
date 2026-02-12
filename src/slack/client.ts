import { WebClient } from "@slack/web-api";

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
