import type { LocationQuery } from "vue-router";
import type { LibraryItem } from "#web/api/library";
import { formatDate, formatSize } from "./format";
import { REQUEST_STATES, type StateBadge } from "./states";
import { lastWatch } from "./watch";

export type LibrarySort = "title" | "size" | "watched" | "added";
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
  { value: "watched", label: "Last watched" },
  { value: "added", label: "Date added" },
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

const SORT_LABELS: Record<LibrarySort, string> = {
  title: "A–Z",
  size: "Largest first",
  watched: "Recently watched",
  added: "Recently added",
};

const labelOf = <T extends string>(options: { value: T; label: string }[], value: T) =>
  options.find((option) => option.value === value)?.label ?? value;

export function filterLabel(key: LibraryFilterKey, view: LibraryView): string {
  switch (key) {
    case "sort":
      return SORT_LABELS[view.sort];
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

export function searchKey(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

export function sortTitle(title: string): string {
  return title.replace(/^(the|a|an)\s+/i, "");
}

const titleOrder = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

export function letterOf(item: LibraryItem): string {
  const first = searchKey(sortTitle(item.title)).charAt(0).toUpperCase();
  return /[A-Z]/.test(first) ? first : "#";
}

export interface LetterGroup {
  letter: string;
  items: LibraryItem[];
}

export function groupByLetter(items: LibraryItem[]): LetterGroup[] {
  const groups: LetterGroup[] = [];
  for (const item of items) {
    const letter = letterOf(item);
    const last = groups.at(-1);
    if (last?.letter === letter) last.items.push(item);
    else groups.push({ letter, items: [item] });
  }
  return groups;
}

function matches(item: LibraryItem, view: LibraryView, term: string): boolean {
  if (term && !searchKey(item.title).includes(term)) return false;
  if (view.type !== "all" && item.mediaType !== view.type) return false;
  if (view.availability !== "all" && item.availability !== view.availability) return false;
  if (view.requestedByMe && !item.requestedByMe) return false;
  if (view.unwatched && (item.watchedBy.length > 0 || item.availability === "missing")) {
    return false;
  }
  return true;
}

function byTitle(a: LibraryItem, b: LibraryItem): number {
  return titleOrder.compare(sortTitle(a.title), sortTitle(b.title));
}

/** Most recently played first; what nobody has played follows, by title. */
function byLastWatched(a: LibraryItem, b: LibraryItem): number {
  const latestA = lastWatch(a.watchedBy)?.watchedAt ?? "";
  const latestB = lastWatch(b.watchedBy)?.watchedAt ?? "";
  return latestB.localeCompare(latestA) || byTitle(a, b);
}

function byAdded(a: LibraryItem, b: LibraryItem): number {
  return (b.addedAt ?? "").localeCompare(a.addedAt ?? "") || byTitle(a, b);
}

export function applyLibraryView(items: LibraryItem[], view: LibraryView): LibraryItem[] {
  const term = searchKey(view.search);
  const shown = items.filter((item) => matches(item, view, term));
  if (view.sort === "size") return shown.toSorted((a, b) => b.sizeOnDisk - a.sizeOnDisk);
  if (view.sort === "watched") return shown.toSorted(byLastWatched);
  if (view.sort === "added") return shown.toSorted(byAdded);
  return shown.toSorted(byTitle);
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

/** What a row says about an item, leading with whatever it is sorted by. */
export function libraryDetails(item: LibraryItem, sort: LibrarySort = "title"): string[] {
  const details: string[] = [];
  if (item.year) details.push(String(item.year));
  details.push(item.mediaType === "movie" ? "Movie" : "Series");
  if (item.availability === "available" && item.episodes) details.push(`${item.episodes.total} ep`);
  if (item.sizeOnDisk > 0) {
    const size = formatSize(item.sizeOnDisk);
    if (sort === "size") details.unshift(size);
    else details.push(size);
  }
  const latest = lastWatch(item.watchedBy);
  if (sort === "watched" && latest) details.unshift(`watched ${daysAgo(latest.watchedAt)}`);
  if (sort === "added" && item.addedAt) details.unshift(`added ${daysAgo(item.addedAt)}`);
  return details;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function daysAgo(iso: string, now: Date = new Date()): string {
  const days = Math.round((startOfDay(now) - startOfDay(new Date(iso))) / DAY_MS);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return formatDate(iso, now);
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
    return { label: "Not on disk", tone: "neutral", downloading: false };
  }
  return undefined;
}

export function libraryStatuses(item: LibraryItem): LibraryStatus[] {
  const statuses: LibraryStatus[] = [];
  if (item.availability === "partial" && item.episodes) {
    const label = `${item.episodes.present} of ${item.episodes.total} episodes`;
    statuses.push({ label, tone: "amber", downloading: false });
  }
  const download = downloadStatus(item);
  if (download) statuses.push(download);
  return statuses;
}
