INSERT INTO "plex_account_owners" ("plex_account_id", "user_id")
SELECT "plex_account_id", "id" FROM "users" WHERE "plex_account_id" IS NOT NULL
ON CONFLICT ("plex_account_id") DO NOTHING;
--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "plex_account_id";
