CREATE TABLE "media_removals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"media_type" text NOT NULL,
	"tmdb_id" integer NOT NULL,
	"title" text NOT NULL,
	"removed_by" text,
	"deleted_files" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "media_removals_media_idx" ON "media_removals" USING btree ("media_type","tmdb_id");