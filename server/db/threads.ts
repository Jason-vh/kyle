import { asc, count, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "./index.ts";
import { conversations, messages } from "./schema.ts";

/** Interfaces whose conversations are worth showing in the thread viewer. */
const VISIBLE_INTERFACES = ["slack", "discord"];

const MAX_THREADS = 200;
const MAX_PREVIEW_MEDIA_REFS = 5;

export interface ThreadSummaryRow {
  id: string;
  interfaceType: string;
  createdAt: Date;
  messageCount: number | null;
  /** Text of the first user message, if it had any. */
  preview: string | null;
  /** `[{action, title}]`, still encoded; aggregated in SQL to avoid a query per thread. */
  mediaRefsJson: string | null;
}

/** Newest conversations first, each with the counts and preview the list needs. */
export async function listThreadSummaries(): Promise<ThreadSummaryRow[]> {
  const messageCounts = db
    .select({
      conversationId: messages.conversationId,
      msgCount: count().as("msg_count"),
    })
    .from(messages)
    .where(ne(messages.role, "toolResult"))
    .groupBy(messages.conversationId)
    .as("msg_counts");

  return db
    .select({
      id: conversations.id,
      interfaceType: conversations.interfaceType,
      createdAt: conversations.createdAt,
      messageCount: messageCounts.msgCount,
      preview: sql<string | null>`(
        SELECT CASE
          WHEN jsonb_typeof(data->'content') = 'string' THEN data->>'content'
          WHEN jsonb_typeof(data->'content') = 'array'  THEN (
            SELECT elem->>'text'
            FROM jsonb_array_elements(data->'content') AS elem
            WHERE elem->>'type' = 'text'
            LIMIT 1
          )
        END
        FROM ${messages}
        WHERE ${messages.conversationId} = ${conversations.id}
          AND role = 'user'
        ORDER BY sequence ASC
        LIMIT 1
      )`.as("preview"),
      mediaRefsJson: sql<string | null>`(
        SELECT json_agg(
          json_build_object('action', action, 'title', title)
          ORDER BY created_at ASC
        )::text
        FROM (
          SELECT action, title, created_at
          FROM media_events
          WHERE conversation_id = ${conversations.id}
          LIMIT ${MAX_PREVIEW_MEDIA_REFS}
        ) sub
      )`.as("media_refs_json"),
    })
    .from(conversations)
    .leftJoin(messageCounts, sql`${conversations.id} = ${messageCounts.conversationId}`)
    .where(inArray(conversations.interfaceType, VISIBLE_INTERFACES))
    .orderBy(desc(conversations.createdAt))
    .limit(MAX_THREADS);
}

export async function findConversation(id: string) {
  return db.query.conversations.findFirst({ where: eq(conversations.id, id) });
}

/** Every stored message of a conversation, oldest first. */
export async function listConversationMessages(conversationId: string) {
  return db
    .select({
      data: messages.data,
      createdAt: messages.createdAt,
      platformUserId: messages.platformUserId,
      userId: messages.userId,
    })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.sequence));
}
