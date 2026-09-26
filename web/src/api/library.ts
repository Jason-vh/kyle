import type { LibraryItem, LibraryMediaType, StorageStat } from "#shared/types";
import { apiFetch } from "./client";

export type { LibraryItem, LibraryMediaType };

export interface LibraryListing {
  items: LibraryItem[];
  unavailable: string[];
  storage?: StorageStat;
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

/** One season given back: its files go, the series and its other seasons stay. */
export interface ReleasableSeason {
  serviceId: number;
  seasonNumber: number;
}

export async function releaseSeason(season: ReleasableSeason): Promise<void> {
  await apiFetch(`/api/library/series/${season.serviceId}/seasons/${season.seasonNumber}`, {
    method: "DELETE",
  });
}

/** Whether Sonarr keeps looking for a season; what is on disk stays either way. */
export interface SeasonMonitoring {
  serviceId: number;
  seasonNumber: number;
  monitored: boolean;
}

export async function setSeasonMonitored(change: SeasonMonitoring): Promise<void> {
  await apiFetch(`/api/library/series/${change.serviceId}/seasons/${change.seasonNumber}`, {
    method: "PUT",
    body: JSON.stringify({ monitored: change.monitored }),
  });
}

/** Keep up with a series already held: seasons announced later are grabbed too. */
export interface FollowChange {
  serviceId: number;
  follow: boolean;
}

export async function followSeries(change: FollowChange): Promise<void> {
  await apiFetch(`/api/library/series/${change.serviceId}/follow`, {
    method: "PUT",
    body: JSON.stringify({ follow: change.follow }),
  });
}
