import type { LibraryItem, LibraryMediaType } from "@shared/types";
import { apiFetch } from "./client";

export type { LibraryItem, LibraryMediaType };

export interface LibraryListing {
  items: LibraryItem[];
  unavailable: string[];
}

export async function getLibrary(): Promise<LibraryListing> {
  return apiFetch<LibraryListing>("/api/library");
}

export async function removeLibraryItem(item: LibraryItem, deleteFiles: boolean): Promise<void> {
  await apiFetch(`/api/library/${item.mediaType}/${item.serviceId}?deleteFiles=${deleteFiles}`, {
    method: "DELETE",
  });
}
