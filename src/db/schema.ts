import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  integer,
  index,
} from "drizzle-orm/pg-core";

export const mediaRefs = pgTable(
  "media_refs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    toolCallId: text("tool_call_id").notNull(),
    mediaType: text("media_type").notNull(),
    title: text("title").notNull(),
    action: text("action").notNull(),
    ids: jsonb("ids").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("media_refs_conversation_id_idx").on(table.conversationId),
    index("media_refs_action_idx").on(table.action),
  ]
);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    externalId: text("external_id"),
    interfaceType: text("interface_type").notNull(),
    userId: text("user_id"),
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

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    sequence: integer("sequence").notNull().generatedAlwaysAsIdentity(),
    data: jsonb("data").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("messages_conversation_id_idx").on(table.conversationId),
    index("messages_conversation_sequence_idx").on(
      table.conversationId,
      table.sequence
    ),
  ]
);
