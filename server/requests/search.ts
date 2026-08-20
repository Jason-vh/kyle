import * as tmdb from "../tmdb/api.ts";
import type { TMDBMultiResult } from "../tmdb/types.ts";
import { getLibraryIndex, type LibraryStatus } from "./library.ts";
import { getRequestersByTmdbId } from "../db/requests.ts";
import type { RequestableMediaType } from "./service.ts";

export interface DiscoverResult {
  tmdbId: number;
  mediaType: RequestableMediaType;
  title: string;
  year?: number;
  overview: string;
  posterPath: string | null;
  /** Absent when the title is in neither Radarr nor Sonarr. */
  libraryStatus?: LibraryStatus;
  /** Display names of everyone who has requested it. */
  requestedBy: string[];
}

function yearOf(date?: string): number | undefined {
  const year = Number(date?.slice(0, 4));
  return Number.isFinite(year) && year > 0 ? year : undefined;
}

/** TMDB's multi search also returns people, who cannot be requested. */
function toResult(item: TMDBMultiResult): DiscoverResult | null {
  if (item.media_type === "movie") {
    return {
      tmdbId: item.id,
      mediaType: "movie",
      title: item.title,
      year: yearOf(item.release_date),
      overview: item.overview,
      posterPath: item.poster_path,
      requestedBy: [],
    };
  }

  if (item.media_type === "tv") {
    return {
      tmdbId: item.id,
      mediaType: "series",
      title: item.name,
      year: yearOf(item.first_air_date),
      overview: item.overview,
      posterPath: item.poster_path,
      requestedBy: [],
    };
  }

  return null;
}

/**
 * Search TMDB and annotate each hit with what the library already holds and
 * who has asked for it, which is what tells the user whether to request.
 */
export async function searchRequestableMedia(query: string): Promise<DiscoverResult[]> {
  const response = await tmdb.searchMulti(query);
  const results = response.results.map(toResult).filter((r) => r !== null);

  const library = await getLibraryIndex();

  const [movieRequesters, seriesRequesters] = await Promise.all([
    getRequestersByTmdbId(
      "movie",
      results.filter((r) => r.mediaType === "movie").map((r) => r.tmdbId),
    ),
    getRequestersByTmdbId(
      "series",
      results.filter((r) => r.mediaType === "series").map((r) => r.tmdbId),
    ),
  ]);

  for (const result of results) {
    result.libraryStatus = library[result.mediaType].get(result.tmdbId)?.status;
    const requesters = result.mediaType === "movie" ? movieRequesters : seriesRequesters;
    result.requestedBy = requesters.get(result.tmdbId) ?? [];
  }

  return results;
}
