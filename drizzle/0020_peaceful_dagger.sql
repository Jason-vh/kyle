DROP INDEX "media_requests_user_media_idx";--> statement-breakpoint
ALTER TABLE "media_requests" ADD COLUMN "season_number" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "media_requests_user_season_idx" ON "media_requests" USING btree ("user_id","media_type","tmdb_id","season_number") WHERE season_number IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "media_requests_user_media_idx" ON "media_requests" USING btree ("user_id","media_type","tmdb_id") WHERE season_number IS NULL;