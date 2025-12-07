import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Conversations table - one record per Slack thread
 */
export const conversations = sqliteTable(
	"conversations",
	{
		id: text("id").primaryKey(),
		threadTs: text("thread_ts").notNull(),
		channelId: text("channel_id").notNull(),
		userId: text("user_id").notNull(),
		createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
	},
	(table) => [
		index("conversations_thread_idx").on(table.threadTs, table.channelId),
		index("conversations_user_idx").on(table.userId),
	]
);

/**
 * Tool calls table - stores each tool invocation and its result
 */
export const toolCalls = sqliteTable(
	"tool_calls",
	{
		id: text("id").primaryKey(),
		conversationId: text("conversation_id")
			.notNull()
			.references(() => conversations.id),
		toolName: text("tool_name").notNull(),
		input: text("input", { mode: "json" }).notNull().$type<Record<string, unknown>>(),
		result: text("result", { mode: "json" }).$type<unknown>(),
		timestamp: integer("timestamp", { mode: "timestamp" }).notNull(),
	},
	(table) => [
		index("tool_calls_conversation_idx").on(table.conversationId),
		index("tool_calls_tool_name_idx").on(table.toolName),
	]
);

/**
 * Media references table - indexes tool calls by media IDs for cross-thread lookups
 */
export const mediaRefs = sqliteTable(
	"media_refs",
	{
		id: text("id").primaryKey(),
		conversationId: text("conversation_id")
			.notNull()
			.references(() => conversations.id),
		toolCallId: text("tool_call_id").references(() => toolCalls.id),
		mediaType: text("media_type").notNull().$type<"movie" | "series">(),
		ids: text("ids", { mode: "json" }).notNull().$type<Record<string, number>>(),
		title: text("title"),
		action: text("action").notNull().$type<"search" | "add" | "remove" | "query">(),
		createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
	},
	(table) => [
		index("media_refs_conversation_idx").on(table.conversationId),
	]
);

// Type exports for use in repository
export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
export type ToolCall = typeof toolCalls.$inferSelect;
export type NewToolCall = typeof toolCalls.$inferInsert;
export type MediaRef = typeof mediaRefs.$inferSelect;
export type NewMediaRef = typeof mediaRefs.$inferInsert;
