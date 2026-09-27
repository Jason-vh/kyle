CREATE TABLE "tmdb_descriptions" (
	"media_type" text NOT NULL,
	"tmdb_id" integer NOT NULL,
	"description" jsonb NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tmdb_descriptions_media_type_tmdb_id_pk" PRIMARY KEY("media_type","tmdb_id")
);
