import type { LibraryItem, LibraryMediaType } from "@shared/types";
import { apiFetch } from "./client";

export type { LibraryItem, LibraryMediaType };

export async function getLibrary(): Promise<LibraryItem[]> {
  const { items } = await apiFetch<{ items: LibraryItem[] }>("/api/library");
  return items;
}

export async function removeLibraryItem(item: LibraryItem, deleteFiles: boolean): Promise<void> {
  await apiFetch(`/api/library/${item.mediaType}/${item.serviceId}?deleteFiles=${deleteFiles}`, {
    method: "DELETE",
  });
}

const UNITS = ["B", "KB", "MB", "GB", "TB"];

export function formatSize(bytes: number): string {
  if (bytes <= 0) return "—";
  const exponent = Math.min(Math.floor(Math.log10(bytes) / 3), UNITS.length - 1);
  const value = bytes / 1000 ** exponent;
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${UNITS[exponent]}`;
}
