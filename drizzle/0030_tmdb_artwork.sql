CREATE TABLE "tmdb_artwork" (
	"media_type" text NOT NULL,
	"tmdb_id" integer NOT NULL,
	"poster_path" text,
	"backdrop_path" text,
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tmdb_artwork_media_type_tmdb_id_pk" PRIMARY KEY("media_type","tmdb_id")
);
