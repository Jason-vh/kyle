CREATE TABLE "media_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"media_type" text NOT NULL,
	"tmdb_id" integer NOT NULL,
	"title" text NOT NULL,
	"year" integer,
	"poster_path" text,
	"service_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media_requests" ADD CONSTRAINT "media_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "media_requests_user_media_idx" ON "media_requests" USING btree ("user_id","media_type","tmdb_id");--> statement-breakpoint
CREATE INDEX "media_requests_created_at_idx" ON "media_requests" USING btree ("created_at");