import type { LibraryItem, LibraryMediaType } from "#shared/types";
import { apiFetch } from "./client";

export type { LibraryItem, LibraryMediaType };

export interface LibraryListing {
  items: LibraryItem[];
  unavailable: string[];
}

export async function getLibrary(): Promise<LibraryListing> {
  return apiFetch<LibraryListing>("/api/library");
}

/** Anything naming a title in a service can be removed; the listing row is one. */
export interface RemovableItem {
  mediaType: LibraryMediaType;
  serviceId: number;
}

export async function removeLibraryItem(item: RemovableItem, deleteFiles: boolean): Promise<void> {
  await apiFetch(`/api/library/${item.mediaType}/${item.serviceId}?deleteFiles=${deleteFiles}`, {
    method: "DELETE",
  });
}
