CREATE TABLE IF NOT EXISTS "media_refs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"tool_call_id" text NOT NULL,
	"media_type" text NOT NULL,
	"title" text NOT NULL,
	"action" text NOT NULL,
	"ids" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "media_refs" ADD CONSTRAINT "media_refs_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_refs_conversation_id_idx" ON "media_refs" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_refs_action_idx" ON "media_refs" USING btree ("action");