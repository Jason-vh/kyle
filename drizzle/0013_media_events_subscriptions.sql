-- Rename media_refs → media_events
ALTER TABLE "media_refs" RENAME TO "media_events";
--> statement-breakpoint
-- Rename FK constraints
ALTER TABLE "media_events" RENAME CONSTRAINT "media_refs_conversation_id_conversations_id_fk" TO "media_events_conversation_id_conversations_id_fk";
--> statement-breakpoint
ALTER TABLE "media_events" RENAME CONSTRAINT "media_refs_message_id_messages_id_fk" TO "media_events_message_id_messages_id_fk";
--> statement-breakpoint
ALTER TABLE "media_events" RENAME CONSTRAINT "media_refs_user_id_users_id_fk" TO "media_events_user_id_users_id_fk";
--> statement-breakpoint
-- Rename indexes
ALTER INDEX "media_refs_conversation_id_idx" RENAME TO "media_events_conversation_id_idx";
--> statement-breakpoint
ALTER INDEX "media_refs_message_id_idx" RENAME TO "media_events_message_id_idx";
--> statement-breakpoint
ALTER INDEX "media_refs_action_idx" RENAME TO "media_events_action_idx";
--> statement-breakpoint
ALTER INDEX "media_refs_platform_user_id_idx" RENAME TO "media_events_platform_user_id_idx";
--> statement-breakpoint
-- Add season/episode granularity
ALTER TABLE "media_events" ADD COLUMN "season_number" integer;
--> statement-breakpoint
ALTER TABLE "media_events" ADD COLUMN "episode_number" integer;
--> statement-breakpoint
-- Create movie_subscriptions table
CREATE TABLE "movie_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"radarr_id" integer NOT NULL,
	"conversation_id" uuid NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "movie_subscriptions" ADD CONSTRAINT "movie_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "movie_subscriptions" ADD CONSTRAINT "movie_subscriptions_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "movie_subscriptions_user_radarr_idx" ON "movie_subscriptions" USING btree ("user_id", "radarr_id");
--> statement-breakpoint
CREATE INDEX "movie_subscriptions_radarr_active_idx" ON "movie_subscriptions" USING btree ("radarr_id") WHERE active = true;
--> statement-breakpoint
-- Create series_subscriptions table
CREATE TABLE "series_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"sonarr_id" integer NOT NULL,
	"season_number" integer,
	"episode_number" integer,
	"conversation_id" uuid NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "series_subscriptions" ADD CONSTRAINT "series_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "series_subscriptions" ADD CONSTRAINT "series_subscriptions_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "series_subscriptions_whole_series_idx" ON "series_subscriptions" USING btree ("user_id", "sonarr_id") WHERE season_number IS NULL AND episode_number IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "series_subscriptions_season_idx" ON "series_subscriptions" USING btree ("user_id", "sonarr_id", "season_number") WHERE season_number IS NOT NULL AND episode_number IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "series_subscriptions_episode_idx" ON "series_subscriptions" USING btree ("user_id", "sonarr_id", "season_number", "episode_number") WHERE season_number IS NOT NULL AND episode_number IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "series_subscriptions_sonarr_active_idx" ON "series_subscriptions" USING btree ("sonarr_id") WHERE active = true;
--> statement-breakpoint
-- Backfill movie subscriptions from existing media_events (while notify column still exists)
-- Takes the most recent 'add' event per (user, radarr_id), excluding those with a subsequent 'remove'
INSERT INTO movie_subscriptions (user_id, radarr_id, conversation_id, active)
SELECT DISTINCT ON (me.user_id, (me.ids->>'radarr')::int)
  me.user_id, (me.ids->>'radarr')::int, me.conversation_id, me.notify
FROM media_events me
WHERE me.action = 'add' AND me.media_type = 'movie'
  AND me.user_id IS NOT NULL AND me.ids->>'radarr' IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM media_events rm
    WHERE rm.action = 'remove' AND rm.media_type = 'movie'
      AND rm.user_id = me.user_id
      AND (rm.ids->>'radarr')::int = (me.ids->>'radarr')::int
      AND rm.created_at > me.created_at
  )
ORDER BY me.user_id, (me.ids->>'radarr')::int, me.created_at DESC;
--> statement-breakpoint
-- Backfill series subscriptions (whole-series scope only)
INSERT INTO series_subscriptions (user_id, sonarr_id, conversation_id, active)
SELECT DISTINCT ON (me.user_id, (me.ids->>'sonarr')::int)
  me.user_id, (me.ids->>'sonarr')::int, me.conversation_id, me.notify
FROM media_events me
WHERE me.action = 'add' AND me.media_type = 'series'
  AND me.user_id IS NOT NULL AND me.ids->>'sonarr' IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM media_events rm
    WHERE rm.action = 'remove' AND rm.media_type = 'series'
      AND rm.user_id = me.user_id
      AND (rm.ids->>'sonarr')::int = (me.ids->>'sonarr')::int
      AND rm.created_at > me.created_at
  )
ORDER BY me.user_id, (me.ids->>'sonarr')::int, me.created_at DESC;
--> statement-breakpoint
-- Drop notify column (no longer needed — replaced by subscription active flag)
ALTER TABLE "media_events" DROP COLUMN "notify";
