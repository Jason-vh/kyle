-- Rename user_id → platform_user_id on conversations, messages, media_refs
ALTER TABLE "conversations" RENAME COLUMN "user_id" TO "platform_user_id";
--> statement-breakpoint
ALTER TABLE "messages" RENAME COLUMN "user_id" TO "platform_user_id";
--> statement-breakpoint
ALTER TABLE "media_refs" RENAME COLUMN "user_id" TO "platform_user_id";
--> statement-breakpoint
-- Rename the indexes to match
ALTER INDEX "conversations_user_id_idx" RENAME TO "conversations_platform_user_id_idx";
--> statement-breakpoint
ALTER INDEX "messages_user_id_idx" RENAME TO "messages_platform_user_id_idx";
--> statement-breakpoint
ALTER INDEX "media_refs_user_id_idx" RENAME TO "media_refs_platform_user_id_idx";
