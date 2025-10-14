import { createLogger } from "@/lib/logger";
import type {
	SlackBlock,
	SlackConversationsRepliesResponse,
	SlackUsersInfoResponse,
} from "./types";

const logger = createLogger("slack/client");

const TOKEN = process.env.SLACK_BOT_TOKEN;
const BASE_URL = "https://slack.com/api";

if (!TOKEN) {
	throw new Error("SLACK_BOT_TOKEN is not configured");
}

if (!BASE_URL) {
	throw new Error("SLACK_BASE_URL is not configured");
}

async function request({
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
		Authorization: `Bearer ${TOKEN}`,
		"Content-Type": "application/json; charset=utf-8",
	};

	const url = new URL(`${BASE_URL}/${operation}`);

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

export async function sendMessage(params: {
	channel: string;
	text?: string;
	thread_ts: string;
	blocks?: SlackBlock[];
}): Promise<unknown> {
	return request({
		operation: "chat.postMessage",
		method: "POST",
		data: params,
	});
}

export async function setThreadStatus(params: {
	channel_id: string;
	thread_ts: string;
	status: string;
}): Promise<unknown> {
	const result = await request({
		operation: "assistant.threads.setStatus",
		method: "POST",
		data: params,
	});

	return result;
}

export async function fetchUserInfo(
	userId: string
): Promise<SlackUsersInfoResponse> {
	const result = await request({
		operation: "users.info",
		method: "GET",
		query: { user: userId },
	});

	return result as SlackUsersInfoResponse;
}

export async function fetchThreadReplies({
	channel,
	ts,
	limit = 20,
}: {
	channel: string;
	ts: string;
	limit: number;
}): Promise<SlackConversationsRepliesResponse> {
	const result = await request({
		operation: "conversations.replies",
		method: "GET",
		query: { channel, ts, limit: limit.toString() },
	});

	return result as SlackConversationsRepliesResponse;
}
