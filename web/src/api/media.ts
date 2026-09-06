import type { LibraryMediaType, MediaDetail } from "#shared/types";
import { apiFetch } from "./client";

export type { MediaDetail };

export async function getMediaDetail(
  mediaType: LibraryMediaType,
  tmdbId: number,
): Promise<MediaDetail> {
  return apiFetch<MediaDetail>(`/api/media/${mediaType}/${tmdbId}`);
}
