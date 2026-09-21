CREATE TABLE "plex_account_owners" (
	"plex_account_id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plex_account_owners" ADD CONSTRAINT "plex_account_owners_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "plex_account_owners" ("plex_account_id", "user_id")
SELECT DISTINCT ON ("plex_account_id") "plex_account_id", "user_id"
FROM (
  SELECT "plex_account_id", "id" AS "user_id", "created_at" AS "linked_at", 0 AS "priority"
  FROM "users"
  WHERE "plex_account_id" IS NOT NULL
  UNION ALL
  SELECT "platform_user_id", "user_id", "linked_at", 1 AS "priority"
  FROM "platform_identities"
  WHERE "platform" = 'plex'
) AS "previous_links"
ORDER BY "plex_account_id", "priority" DESC, "linked_at" DESC, "user_id" DESC;
