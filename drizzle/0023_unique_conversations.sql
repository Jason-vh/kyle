CREATE TEMP TABLE conversation_duplicates ON COMMIT DROP AS
SELECT id, first_value(id) OVER (PARTITION BY external_id, interface_type ORDER BY created_at, id) AS canonical_id
FROM conversations WHERE external_id IS NOT NULL;--> statement-breakpoint
DELETE FROM conversation_duplicates WHERE id = canonical_id;--> statement-breakpoint
UPDATE messages SET conversation_id = d.canonical_id FROM conversation_duplicates d WHERE conversation_id = d.id;--> statement-breakpoint
UPDATE media_events SET conversation_id = d.canonical_id FROM conversation_duplicates d WHERE conversation_id = d.id;--> statement-breakpoint
UPDATE webhook_notifications SET conversation_id = d.canonical_id FROM conversation_duplicates d WHERE conversation_id = d.id;--> statement-breakpoint
UPDATE movie_subscriptions SET conversation_id = d.canonical_id FROM conversation_duplicates d WHERE conversation_id = d.id;--> statement-breakpoint
UPDATE series_subscriptions SET conversation_id = d.canonical_id FROM conversation_duplicates d WHERE conversation_id = d.id;--> statement-breakpoint
DELETE FROM conversations USING conversation_duplicates d WHERE conversations.id = d.id;--> statement-breakpoint
DROP INDEX "conversations_external_id_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_external_id_idx" ON "conversations" USING btree ("external_id","interface_type");