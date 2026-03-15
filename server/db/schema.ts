import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  integer,
  index,
  boolean,
  bigint,
  uniqueIndex,
  customType,
} from "drizzle-orm/pg-core";

// Custom type for bytea columns
const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
  toDriver(value: Uint8Array): Buffer {
    return Buffer.from(value);
  },
  fromDriver(value: Buffer): Uint8Array {
    return new Uint8Array(value);
  },
});

export type WebhookNotificationPayload = {
  mediaType: "movie" | "series";
  title: string;
  year: number;
  quality?: string;
  releaseGroup?: string;
  episodes?: Array<{ seasonNumber: number; episodeNumber: number; title: string }>;
};

// ---- New user entity tables ----

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  displayName: text("display_name").notNull(),
  isAdmin: boolean("is_admin").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const platformIdentities = pgTable(
  "platform_identities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(), // 'slack' | 'discord'
    platformUserId: text("platform_user_id").notNull(),
    platformUsername: text("platform_username"),
    linkedAt: timestamp("linked_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("platform_identities_platform_user_idx").on(table.platform, table.platformUserId),
    index("platform_identities_user_id_idx").on(table.userId),
  ],
);

export const userCredentials = pgTable(
  "user_credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    credentialId: text("credential_id").notNull().unique(),
    publicKey: bytea("public_key").notNull(),
    counter: bigint("counter", { mode: "number" }).notNull(),
    deviceType: text("device_type"),
    backedUp: boolean("backed_up"),
    transports: text("transports").array(),
    name: text("name"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at"),
  },
  (table) => [index("user_credentials_user_id_idx").on(table.userId)],
);

export const userInvites = pgTable("user_invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  createdBy: uuid("created_by").references(() => users.id),
  displayName: text("display_name").notNull(),
  isAdmin: boolean("is_admin").notNull().default(false),
  usedBy: uuid("used_by").references(() => users.id),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  usedAt: timestamp("used_at"),
});

// ---- Existing tables (userId renamed to platformUserId, new userId FK added) ----

export const mediaRefs = pgTable(
  "media_refs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    messageId: uuid("message_id").references(() => messages.id),
    toolCallId: text("tool_call_id").notNull(),
    platformUserId: text("platform_user_id"),
    userId: uuid("user_id").references(() => users.id),
    mediaType: text("media_type").notNull(),
    title: text("title").notNull(),
    action: text("action").notNull(),
    ids: jsonb("ids").notNull(),
    notify: boolean("notify").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("media_refs_conversation_id_idx").on(table.conversationId),
    index("media_refs_message_id_idx").on(table.messageId),
    index("media_refs_action_idx").on(table.action),
    index("media_refs_platform_user_id_idx").on(table.platformUserId),
  ],
);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    externalId: text("external_id"),
    interfaceType: text("interface_type").notNull(),
    platformUserId: text("platform_user_id"),
    userId: uuid("user_id").references(() => users.id),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("conversations_external_id_idx").on(table.externalId, table.interfaceType),
    index("conversations_platform_user_id_idx").on(table.platformUserId),
  ],
);

export const webhookNotifications = pgTable(
  "webhook_notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    source: text("source").notNull(), // 'sonarr' | 'radarr'
    message: text("message").notNull(),
    payload: jsonb("payload").$type<WebhookNotificationPayload>().notNull(),
    receivedAt: timestamp("received_at").notNull().defaultNow(),
  },
  (table) => [index("webhook_notifications_conversation_id_idx").on(table.conversationId)],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    platformUserId: text("platform_user_id"),
    userId: uuid("user_id").references(() => users.id),
    sequence: integer("sequence").notNull().generatedAlwaysAsIdentity(),
    data: jsonb("data").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("messages_conversation_id_idx").on(table.conversationId),
    index("messages_conversation_sequence_idx").on(table.conversationId, table.sequence),
    index("messages_conversation_role_sequence_idx").on(
      table.conversationId,
      table.role,
      table.sequence,
    ),
    index("messages_platform_user_id_idx").on(table.platformUserId),
  ],
);
