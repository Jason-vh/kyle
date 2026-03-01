ALTER TABLE "media_refs" ADD COLUMN "user_id" text;--> statement-breakpoint
CREATE INDEX "media_refs_user_id_idx" ON "media_refs" USING btree ("user_id");--> statement-breakpoint
UPDATE "media_refs" SET "user_id" = c."user_id" FROM "conversations" c WHERE c."id" = "media_refs"."conversation_id" AND c."user_id" IS NOT NULL;