ALTER TABLE "media_refs" ADD COLUMN "message_id" uuid;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "media_refs" ADD CONSTRAINT "media_refs_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_refs_message_id_idx" ON "media_refs" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "messages_user_id_idx" ON "messages" USING btree ("user_id");--> statement-breakpoint

-- Backfill messages.user_id from conversations.user_id for user-role messages
UPDATE messages m
SET user_id = c.user_id
FROM conversations c
WHERE c.id = m.conversation_id
  AND m.role = 'user'
  AND c.user_id IS NOT NULL;--> statement-breakpoint

-- Backfill media_refs.message_id by finding the assistant message containing the matching toolCallId
UPDATE media_refs mr
SET message_id = m.id
FROM messages m
WHERE m.conversation_id = mr.conversation_id
  AND m.role = 'assistant'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(m.data->'content') AS elem
    WHERE elem->>'type' = 'toolCall'
      AND elem->>'id' = mr.tool_call_id
  );