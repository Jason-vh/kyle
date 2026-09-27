import type { MediaRequest, SeriesRequestOptions } from "#shared/types";
import { apiFetch } from "./client";

export type {
  MediaRequest,
  MissingSeason,
  RequestState,
  SeasonOption,
  SeriesRequestOptions,
} from "#shared/types";

export type RequestableMediaType = "movie" | "series";
export type LibraryStatus = "available" | "pending" | "unknown";

export interface DiscoverResult {
  tmdbId: number;
  mediaType: RequestableMediaType;
  title: string;
  year?: number;
  overview: string;
  posterPath: string | null;
  libraryStatus?: LibraryStatus;
  requestedBy: string[];
}

/** The least a request needs; a search hit and a title's own page both have it. */
export interface RequestInput {
  mediaType: RequestableMediaType;
  tmdbId: number;
  posterPath: string | null;
  /** A series only: one season of it, or one episode of that season. */
  seasonNumber?: number;
  episodeNumber?: number;
  /** A series only: the seasons wanted now, and whether to keep up with it. */
  seasons?: number[];
  follow?: boolean;
}

export interface RequestOutcome {
  status: "added" | "existing";
  title: string;
  year?: number;
  seasonNumber?: number;
}

export async function discover(query: string): Promise<DiscoverResult[]> {
  const { results } = await apiFetch<{ results: DiscoverResult[] }>(
    `/api/discover?q=${encodeURIComponent(query)}`,
  );
  return results;
}

export async function requestMedia(item: RequestInput): Promise<RequestOutcome> {
  return apiFetch<RequestOutcome>("/api/requests", {
    method: "POST",
    body: JSON.stringify({
      mediaType: item.mediaType,
      tmdbId: item.tmdbId,
      posterPath: item.posterPath ?? undefined,
      seasonNumber: item.seasonNumber,
      episodeNumber: item.episodeNumber,
      seasons: item.seasons,
      follow: item.follow,
    }),
  });
}

export async function getSeriesRequestOptions(tmdbId: number): Promise<SeriesRequestOptions> {
  return apiFetch<SeriesRequestOptions>(`/api/requests/series/${tmdbId}/options`);
}

/** What a retry did, so the UI can say whether a release was given up on. */
export interface RetryOutcome {
  discarded: number;
}

/** All a retry needs: the title is already in the library. */
export interface RetryInput {
  mediaType: RequestableMediaType;
  tmdbId: number;
  /** Acts on the one season that was asked for, rather than the series. */
  seasonNumber?: number | null;
}

/** The season a request named, as the query string the API reads it from. */
function seasonQuery(seasonNumber: number | null | undefined): string {
  return seasonNumber === null || seasonNumber === undefined ? "" : `?season=${seasonNumber}`;
}

export async function retryRequest(item: RetryInput): Promise<RetryOutcome> {
  const scope = seasonQuery(item.seasonNumber);
  return apiFetch<RetryOutcome>(`/api/requests/${item.mediaType}/${item.tmdbId}/retry${scope}`, {
    method: "POST",
  });
}

export async function getRequests(all = false): Promise<MediaRequest[]> {
  const { requests } = await apiFetch<{ requests: MediaRequest[] }>(
    `/api/requests${all ? "?all=true" : ""}`,
  );
  return requests;
}
