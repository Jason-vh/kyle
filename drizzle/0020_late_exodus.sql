CREATE TABLE "job_runs" (
	"name" text PRIMARY KEY NOT NULL,
	"last_run_at" timestamp DEFAULT now() NOT NULL,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "job_state" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
