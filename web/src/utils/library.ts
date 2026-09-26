import type { LocationQuery } from "vue-router";
import type { LibraryItem } from "#web/api/library";
import { formatSize } from "./format";
import { REQUEST_STATES, type StateBadge } from "./states";

export type LibrarySort = "title" | "size";
export type LibraryType = "all" | LibraryItem["mediaType"];
export type LibraryAvailabilityFilter = "all" | LibraryItem["availability"];

export interface LibraryView {
  search: string;
  sort: LibrarySort;
  type: LibraryType;
  availability: LibraryAvailabilityFilter;
  requestedByMe: boolean;
  unwatched: boolean;
}

export type LibraryFilterKey = Exclude<keyof LibraryView, "search">;

export const DEFAULT_LIBRARY_VIEW: LibraryView = {
  search: "",
  sort: "title",
  type: "all",
  availability: "all",
  requestedByMe: false,
  unwatched: false,
};

export const SORT_OPTIONS: { value: LibrarySort; label: string }[] = [
  { value: "title", label: "Title" },
  { value: "size", label: "Size" },
];

export const TYPE_OPTIONS: { value: LibraryType; label: string }[] = [
  { value: "all", label: "All" },
  { value: "movie", label: "Movies" },
  { value: "series", label: "Series" },
];

export const AVAILABILITY_OPTIONS: { value: LibraryAvailabilityFilter; label: string }[] = [
  { value: "all", label: "Any" },
  { value: "available", label: "Complete" },
  { value: "partial", label: "Partial" },
  { value: "missing", label: "Missing" },
];

const labelOf = <T extends string>(options: { value: T; label: string }[], value: T) =>
  options.find((option) => option.value === value)?.label ?? value;

export function filterLabel(key: LibraryFilterKey, view: LibraryView): string {
  switch (key) {
    case "sort":
      return view.sort === "size" ? "Largest first" : "A–Z";
    case "type":
      return labelOf(TYPE_OPTIONS, view.type);
    case "availability":
      return labelOf(AVAILABILITY_OPTIONS, view.availability);
    case "requestedByMe":
      return "Requested by me";
    case "unwatched":
      return "Unwatched";
  }
}

function matches(item: LibraryItem, view: LibraryView, term: string): boolean {
  if (term && !item.title.toLowerCase().includes(term)) return false;
  if (view.type !== "all" && item.mediaType !== view.type) return false;
  if (view.availability !== "all" && item.availability !== view.availability) return false;
  if (view.requestedByMe && !item.requestedByMe) return false;
  if (view.unwatched && (item.watchedBy.length > 0 || item.availability === "missing")) {
    return false;
  }
  return true;
}

export function applyLibraryView(items: LibraryItem[], view: LibraryView): LibraryItem[] {
  const term = view.search.trim().toLowerCase();
  const shown = items.filter((item) => matches(item, view, term));
  if (view.sort === "title") return shown;
  return shown.toSorted((a, b) => b.sizeOnDisk - a.sizeOnDisk);
}

function first(query: LocationQuery, key: string): string | undefined {
  const value = query[key];
  const single = Array.isArray(value) ? value[0] : value;
  return single ?? undefined;
}

function oneOf<T extends string>(
  options: { value: T }[],
  value: string | undefined,
  fallback: T,
): T {
  return options.find((option) => option.value === value)?.value ?? fallback;
}

export function viewFromQuery(query: LocationQuery): LibraryView {
  return {
    search: first(query, "q") ?? DEFAULT_LIBRARY_VIEW.search,
    sort: oneOf(SORT_OPTIONS, first(query, "sort"), DEFAULT_LIBRARY_VIEW.sort),
    type: oneOf(TYPE_OPTIONS, first(query, "type"), DEFAULT_LIBRARY_VIEW.type),
    availability: oneOf(
      AVAILABILITY_OPTIONS,
      first(query, "disk"),
      DEFAULT_LIBRARY_VIEW.availability,
    ),
    requestedByMe: first(query, "mine") === "1",
    unwatched: first(query, "unwatched") === "1",
  };
}

export function viewToQuery(view: LibraryView): Record<string, string> {
  const query: Record<string, string> = {};
  if (view.search) query.q = view.search;
  if (view.sort !== DEFAULT_LIBRARY_VIEW.sort) query.sort = view.sort;
  if (view.type !== DEFAULT_LIBRARY_VIEW.type) query.type = view.type;
  if (view.availability !== DEFAULT_LIBRARY_VIEW.availability) query.disk = view.availability;
  if (view.requestedByMe) query.mine = "1";
  if (view.unwatched) query.unwatched = "1";
  return query;
}

export function changedFilters(view: LibraryView): LibraryFilterKey[] {
  const keys: LibraryFilterKey[] = ["sort", "type", "availability", "requestedByMe", "unwatched"];
  return keys.filter((key) => view[key] !== DEFAULT_LIBRARY_VIEW[key]);
}

export function librarySummary(item: LibraryItem): string {
  const parts = [item.mediaType === "movie" ? "Movie" : "Series"];
  if (item.sizeOnDisk > 0) parts.push(formatSize(item.sizeOnDisk));
  if (item.availability === "available" && item.episodes) {
    parts.push(`${item.episodes.total} ${item.episodes.total === 1 ? "episode" : "episodes"}`);
  }
  return parts.join(" · ");
}

export function watchedLabel(count: number): string {
  return `Watched by ${count} ${count === 1 ? "person" : "people"}`;
}

export interface LibraryStatus extends StateBadge {
  downloading: boolean;
}

function downloadStatus(item: LibraryItem): LibraryStatus | undefined {
  if (item.download?.state === "downloading") {
    const { progress } = item.download;
    const label = progress === undefined ? "" : `${Math.round(progress * 100)}%`;
    return { label, tone: REQUEST_STATES.downloading.tone, downloading: true };
  }
  if (item.download) return { ...REQUEST_STATES[item.download.state], downloading: false };
  if (item.availability === "missing") {
    return { label: "Not downloaded", tone: "red", downloading: false };
  }
  return undefined;
}

export function libraryStatuses(item: LibraryItem): LibraryStatus[] {
  const statuses: LibraryStatus[] = [];
  if (item.availability === "partial" && item.episodes) {
    const label = `${item.episodes.present}/${item.episodes.total} episodes`;
    statuses.push({ label, tone: "amber", downloading: false });
  }
  const download = downloadStatus(item);
  if (download) statuses.push(download);
  if (!item.monitored) statuses.push({ label: "unmonitored", tone: "neutral", downloading: false });
  return statuses;
}
