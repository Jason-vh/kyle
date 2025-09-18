import { createLogger } from "@/lib/logger";
import type {
	SlackConversationsRepliesResponse,
	SlackUsersInfoResponse,
} from "@/lib/slack/types";

const logger = createLogger("slack/client");

export class SlackClient {
	private token: string;
	private baseUrl = "https://slack.com/api";

	constructor(token: string) {
		this.token = token;
	}

	private async request({
		operation,
		method,
		query,
		data,
	}: {
		operation:
			| "chat.postMessage"
			| "assistant.threads.setStatus"
			| "chat.postEphemeral"
			| "users.info"
			| "conversations.info"
			| "conversations.replies";
		method: "POST" | "GET";
		query?: Record<string, string>;
		data?: Record<string, unknown>;
	}): Promise<unknown> {
		const headers: Record<string, string> = {
			Authorization: `Bearer ${this.token}`,
			"Content-Type": "application/json; charset=utf-8",
		};

		const url = new URL(`${this.baseUrl}/${operation}`);

		if (query) {
			url.search = new URLSearchParams(query).toString();
		}

		logger.debug("making request", {
			operation,
			data,
			url: url.toString(),
		});

		const response = await fetch(url, {
			method,
			headers,
			body: data ? JSON.stringify(data) : undefined,
		});

		const result = (await response.json()) as { ok: boolean } & unknown;

		if (!response.ok || !result.ok) {
			logger.error(`Slack API error`, { result, url, method: operation, data });
			throw new Error("error making request to the Slack API");
		}

		return result;
	}

	async postMessage(params: {
		channel: string;
		text?: string;
		thread_ts?: string;
	}) {
		return this.request({
			operation: "chat.postMessage",
			method: "POST",
			data: params,
		});
	}

	async setThreadStatus(params: {
		channel_id: string;
		thread_ts: string;
		status: string;
	}) {
		return this.request({
			operation: "assistant.threads.setStatus",
			method: "POST",
			data: params,
		});
	}

	async postEphemeral(params: {
		channel: string;
		user: string;
		text: string;
		thread_ts?: string;
	}) {
		return this.request({
			operation: "chat.postEphemeral",
			method: "POST",
			data: params,
		});
	}

	async usersInfo(user: string): Promise<SlackUsersInfoResponse> {
		return this.request({
			operation: "users.info",
			method: "GET",
			query: { user },
		}) as Promise<SlackUsersInfoResponse>;
	}

	async conversationsInfo(channel: string) {
		return this.request({
			operation: "conversations.info",
			method: "GET",
			query: { channel },
		});
	}

	async conversationsReplies(
		channel: string,
		ts: string,
		limit: number = 10
	): Promise<SlackConversationsRepliesResponse> {
		return this.request({
			operation: "conversations.replies",
			method: "GET",
			query: { channel, ts, limit: limit.toString() },
		}) as Promise<SlackConversationsRepliesResponse>;
	}
}

export function createSlackClient(): SlackClient {
	if (!process.env.SLACK_BOT_TOKEN) {
		throw new Error("SLACK_BOT_TOKEN is not configured");
	}

	return new SlackClient(process.env.SLACK_BOT_TOKEN);
}
