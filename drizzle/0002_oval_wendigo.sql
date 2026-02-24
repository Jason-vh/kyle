ALTER TABLE "messages" ALTER COLUMN "sequence" ADD GENERATED ALWAYS AS IDENTITY (sequence name "messages_sequence_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1);
--> statement-breakpoint
SELECT setval('messages_sequence_seq', COALESCE((SELECT MAX("sequence") FROM "messages"), 0) + 1, false);