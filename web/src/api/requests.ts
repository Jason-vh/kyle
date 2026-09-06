import type { MediaRequest } from "#shared/types";
import { apiFetch } from "./client";

export type { MediaRequest, RequestState } from "#shared/types";

export type RequestableMediaType = "movie" | "series";
export type LibraryStatus = "available" | "pending";

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
}

export interface RequestOutcome {
  status: "added" | "existing";
  title: string;
  year?: number;
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
    }),
  });
}

export async function getRequests(all = false): Promise<MediaRequest[]> {
  const { requests } = await apiFetch<{ requests: MediaRequest[] }>(
    `/api/requests${all ? "?all=true" : ""}`,
  );
  return requests;
}
