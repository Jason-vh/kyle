import { and, eq } from "drizzle-orm";
import type { LibraryMediaType, MediaDetail, MovieReleases } from "#shared/types.ts";
import { db } from "#server/db/index.ts";
import { tmdbDescriptions } from "#server/db/schema.ts";
import * as tmdb from "#server/tmdb/api.ts";
import { earliestReleases, yearOf } from "#server/tmdb/utils.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
const FRESH_MS = 30 * DAY_MS;
const AWAITING_RELEASE_FRESH_MS = DAY_MS;

export type TmdbDescription = Pick<
  MediaDetail,
  | "title"
  | "year"
  | "tagline"
  | "overview"
  | "posterPath"
  | "backdropPath"
  | "runtime"
  | "genres"
  | "rating"
  | "releases"
>;

function releasesOf(releases: ReturnType<typeof earliestReleases>): MovieReleases {
  return {
    cinema: releases.cinema ?? undefined,
    digital: releases.digital ?? undefined,
    physical: releases.physical ?? undefined,
  };
}

async function fetchDescription(
  mediaType: LibraryMediaType,
  tmdbId: number,
): Promise<TmdbDescription> {
  if (mediaType === "movie") {
    const movie = await tmdb.getMovie(tmdbId);
    return {
      title: movie.title,
      year: yearOf(movie.release_date),
      tagline: movie.tagline || undefined,
      overview: movie.overview || undefined,
      posterPath: movie.poster_path,
      backdropPath: movie.backdrop_path,
      runtime: movie.runtime || undefined,
      genres: movie.genres.map((genre) => genre.name),
      // An unrated title averages 0, which would read as the worst film ever made.
      rating: movie.vote_count > 0 ? movie.vote_average : undefined,
      releases: releasesOf(earliestReleases(movie)),
    };
  }

  const show = await tmdb.getTVShow(tmdbId);
  return {
    title: show.name,
    year: yearOf(show.first_air_date),
    tagline: show.tagline || undefined,
    overview: show.overview || undefined,
    posterPath: show.poster_path,
    backdropPath: show.backdrop_path,
    runtime: show.episode_run_time?.[0] || undefined,
    genres: show.genres.map((genre) => genre.name),
    rating: show.vote_count > 0 ? show.vote_average : undefined,
  };
}

function isOutAtHome(releases: MovieReleases | undefined, now: number): boolean {
  return [releases?.digital, releases?.physical].some(
    (date) => date !== undefined && Date.parse(date) <= now,
  );
}

export function isFresh(
  mediaType: LibraryMediaType,
  description: TmdbDescription,
  fetchedAt: Date,
  now: number,
): boolean {
  const age = now - fetchedAt.getTime();
  if (mediaType === "movie" && !isOutAtHome(description.releases, now)) {
    return age < AWAITING_RELEASE_FRESH_MS;
  }
  return age < FRESH_MS;
}

export async function describe(
  mediaType: LibraryMediaType,
  tmdbId: number,
): Promise<TmdbDescription> {
  const [stored] = await db
    .select()
    .from(tmdbDescriptions)
    .where(and(eq(tmdbDescriptions.mediaType, mediaType), eq(tmdbDescriptions.tmdbId, tmdbId)));
  if (stored && isFresh(mediaType, stored.description, stored.fetchedAt, Date.now())) {
    return stored.description;
  }

  const description = await fetchDescription(mediaType, tmdbId);
  const fetchedAt = new Date();
  await db
    .insert(tmdbDescriptions)
    .values({ mediaType, tmdbId, description, fetchedAt })
    .onConflictDoUpdate({
      target: [tmdbDescriptions.mediaType, tmdbDescriptions.tmdbId],
      set: { description, fetchedAt },
    });
  return description;
}
