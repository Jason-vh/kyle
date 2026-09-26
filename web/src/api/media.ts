import type { LibraryMediaType, MediaActivityResponse, MediaDetail } from "#shared/types";
import { apiFetch } from "./client";

export type { MediaActivity, MediaActivityResponse, MediaDetail } from "#shared/types";

export async function getMediaDetail(
  mediaType: LibraryMediaType,
  tmdbId: number,
): Promise<MediaDetail> {
  return apiFetch<MediaDetail>(`/api/media/${mediaType}/${tmdbId}`);
}

export async function getMediaActivity(
  mediaType: LibraryMediaType,
  tmdbId: number,
): Promise<MediaActivityResponse> {
  return apiFetch<MediaActivityResponse>(`/api/media/${mediaType}/${tmdbId}/activity`);
}
