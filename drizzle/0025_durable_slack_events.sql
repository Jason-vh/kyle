CREATE TABLE "slack_event_jobs" (
	"event_id" text PRIMARY KEY NOT NULL,
	"event" jsonb NOT NULL,
	"team_id" text,
	"available_at" timestamp DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"response_text" text,
	"completed_at" timestamp,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "slack_event_jobs_pending_idx" ON "slack_event_jobs" USING btree ("available_at") WHERE completed_at IS NULL;