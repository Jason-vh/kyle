import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

// Conversations table - tracks chat sessions (will be interface-agnostic)
export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Interface-specific identifier (e.g., Slack thread_ts, CLI session ID)
    externalId: text("external_id").notNull(),
    // Interface type (e.g., "slack", "cli", "http")
    interfaceType: text("interface_type").notNull(),
    // User identifier (interface-specific)
    userId: text("user_id"),
    // Metadata for interface-specific data
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("conversations_external_id_idx").on(
      table.externalId,
      table.interfaceType
    ),
    index("conversations_user_id_idx").on(table.userId),
  ]
);

// Tool calls table - logs AI tool invocations
export const toolCalls = pgTable(
  "tool_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    toolName: text("tool_name").notNull(),
    input: jsonb("input"),
    result: jsonb("result"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("tool_calls_conversation_id_idx").on(table.conversationId),
    index("tool_calls_tool_name_idx").on(table.toolName),
  ]
);

// Media references - cross-references media by multiple IDs for notifications
export const mediaRefs = pgTable(
  "media_refs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    // "movie" or "series"
    mediaType: text("media_type").notNull(),
    // "search", "add", "remove", "query"
    action: text("action").notNull(),
    // JSON object with various IDs: { tmdbId, tvdbId, radarrId, sonarrId }
    ids: jsonb("ids").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("media_refs_conversation_id_idx").on(table.conversationId),
    index("media_refs_media_type_idx").on(table.mediaType),
  ]
);
