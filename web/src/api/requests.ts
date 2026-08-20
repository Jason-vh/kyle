import { apiFetch } from "./client";

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

export interface MediaRequest {
  id: string;
  mediaType: RequestableMediaType;
  tmdbId: number;
  title: string;
  year: number | null;
  posterPath: string | null;
  requestedBy?: string;
  createdAt: string;
}

export interface RequestOutcome {
  status: "added" | "existing";
  title: string;
  year?: number;
}

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w342";

export function posterUrl(posterPath: string | null): string | null {
  return posterPath ? `${TMDB_IMAGE_BASE}${posterPath}` : null;
}

export async function discover(query: string): Promise<DiscoverResult[]> {
  const { results } = await apiFetch<{ results: DiscoverResult[] }>(
    `/api/discover?q=${encodeURIComponent(query)}`,
  );
  return results;
}

export async function requestMedia(item: DiscoverResult): Promise<RequestOutcome> {
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
