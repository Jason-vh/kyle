ALTER TABLE "conversations" ADD COLUMN "durable_conversation_id" bigint;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "durable_projected_through" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_durable_conversation_id_idx" ON "conversations" USING btree ("durable_conversation_id");