CREATE TABLE "notification_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"requester" jsonb NOT NULL,
	"response_text" text,
	"sent_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "webhook_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_key" text NOT NULL,
	"ids" jsonb NOT NULL,
	"media" jsonb NOT NULL,
	"available_at" timestamp NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "webhook_job_id" uuid;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_job_id_webhook_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."webhook_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_deliveries_job_conversation_idx" ON "notification_deliveries" USING btree ("job_id","conversation_id");--> statement-breakpoint
CREATE INDEX "webhook_jobs_pending_idx" ON "webhook_jobs" USING btree ("available_at") WHERE completed_at IS NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_webhook_job_id_webhook_jobs_id_fk" FOREIGN KEY ("webhook_job_id") REFERENCES "public"."webhook_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_user_webhook_idx" ON "notifications" USING btree ("user_id","webhook_job_id");