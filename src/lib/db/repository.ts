import { and, asc, eq } from "drizzle-orm";

import { createLogger } from "@/lib/logger";
import type { SlackContext } from "@/types";

import { conversations, db, mediaRefs, toolCalls } from "./index";
import type {
	NewConversation,
	NewMediaRef,
	NewToolCall,
	ToolCall,
} from "./schema";

const logger = createLogger("db/repository");

/**
 * Media reference data for indexing
 */
export type MediaRef = {
	mediaType: "movie" | "series";
	action: "search" | "add" | "remove" | "query";
	ids: Record<string, number>;
	title?: string;
};

/**
 * Options for saving a tool call
 */
export type SaveToolCallOptions = {
	input: Record<string, unknown>;
	result: unknown;
	mediaRef?: MediaRef;
};

/**
 * Get or create a conversation record for a Slack thread
 */
async function getOrCreateConversation(context: SlackContext): Promise<string> {
	const {
		slack_thread_ts: threadTs,
		slack_channel_id: channelId,
		slack_user_id: userId,
	} = context;

	if (!threadTs || !channelId) {
		throw new Error("Missing thread_ts or channel_id in context");
	}

	// Check if conversation exists
	const existing = await db.query.conversations.findFirst({
		where: and(
			eq(conversations.threadTs, threadTs),
			eq(conversations.channelId, channelId)
		),
	});

	if (existing) {
		return existing.id;
	}

	// Create new conversation
	const id = crypto.randomUUID();

	const newConversation: NewConversation = {
		id,
		threadTs,
		channelId,
		userId: userId ?? "unknown",
		createdAt: new Date(),
	};

	await db.insert(conversations).values(newConversation);
	logger.info("created new conversation", { id, threadTs, channelId });

	return id;
}

/**
 * Save a tool call from within a tool's execute function
 */
export async function saveToolCall(
	context: SlackContext,
	toolName: string,
	options: SaveToolCallOptions
): Promise<void> {
	try {
		const conversationId = await getOrCreateConversation(context);
		const now = new Date();
		const toolCallId = crypto.randomUUID();

		logger.debug("saving tool call", { toolName, options, context });

		const newToolCall: NewToolCall = {
			id: toolCallId,
			conversationId,
			toolName,
			input: options.input,
			result: options.result,
			timestamp: now,
		};

		await db.insert(toolCalls).values(newToolCall);

		// Save media reference if provided
		if (options.mediaRef) {
			const ref = options.mediaRef;
			const newMediaRef: NewMediaRef = {
				id: crypto.randomUUID(),
				conversationId,
				toolCallId,
				mediaType: ref.mediaType,
				ids: ref.ids,
				title: ref.title,
				action: ref.action,
				createdAt: now,
			};

			await db.insert(mediaRefs).values(newMediaRef);
		}

		logger.debug("saved tool call", {
			toolCallId,
			toolName,
			hasMediaRef: !!options.mediaRef,
		});
	} catch (error) {
		// Don't fail the tool if saving fails
		logger.error("failed to save tool call", { toolName, error, context });
	}
}

/**
 * Get tool calls for a conversation thread
 */
export async function getToolCallsForThread(
	threadTs: string,
	channelId: string
): Promise<ToolCall[]> {
	const conversation = await db.query.conversations.findFirst({
		where: and(
			eq(conversations.threadTs, threadTs),
			eq(conversations.channelId, channelId)
		),
	});

	if (!conversation) {
		return [];
	}

	const calls = await db.query.toolCalls.findMany({
		where: eq(toolCalls.conversationId, conversation.id),
		orderBy: [asc(toolCalls.timestamp)],
	});

	return calls;
}

/**
 * Format tool calls for injection into AI context
 */
export function formatToolCallsForContext(calls: ToolCall[]): string {
	if (calls.length === 0) {
		return "";
	}

	const formatted = calls.map((call) => {
		const timestamp = call.timestamp.toISOString();
		const inputStr = JSON.stringify(call.input);
		const resultStr = call.result ? JSON.stringify(call.result) : "no result";
		return `[${timestamp}] ${call.toolName}(${inputStr}) -> ${resultStr}`;
	});

	return `[Previous tool calls in this conversation]\n${formatted.join("\n")}`;
}
