import { defineQueryOptions, useMutation, useQuery, useQueryCache } from "@pinia/colada";
import type { MaybeRefOrGetter } from "vue";
import { toValue } from "vue";
import { getDashboard } from "#web/api/dashboard";
import { getLibrary, removeLibraryItem, type LibraryItem } from "#web/api/library";
import { discover, getRequests, requestMedia, type DiscoverResult } from "#web/api/requests";

/**
 * Everything a change to the library could be visible in. Adding or removing a
 * title touches the library listing, the requests list, the home screen and any
 * search result showing what is already held — so one mutation invalidates all
 * of them rather than each caller remembering which.
 */
const MEDIA_KEYS = [["library"], ["requests"], ["dashboard"], ["discover"]];

export const dashboardQuery = defineQueryOptions({
  key: ["dashboard"],
  query: getDashboard,
  staleTime: 30_000,
});

export const libraryQuery = defineQueryOptions({
  key: ["library"],
  query: getLibrary,
  // The listing is a multi-service call; a minute of staleness makes going
  // back to it instant, which is most of how the app feels on a phone.
  staleTime: 60_000,
});

export const requestsQuery = defineQueryOptions((all: boolean) => ({
  key: ["requests", all ? "all" : "mine"],
  query: () => getRequests(all),
  staleTime: 30_000,
}));

/**
 * Keyed by the search term, so a slower reply for an earlier term can never
 * overwrite a later one — the two are simply different entries.
 */
export const discoverQuery = defineQueryOptions((term: string) => ({
  key: ["discover", term],
  query: () => discover(term),
  enabled: term.length > 0,
  staleTime: 60_000,
}));

export function useDashboard() {
  return useQuery(dashboardQuery);
}

export function useLibrary() {
  return useQuery(libraryQuery);
}

export function useRequests(all: MaybeRefOrGetter<boolean>) {
  return useQuery(() => requestsQuery(toValue(all)));
}

export function useDiscover(term: MaybeRefOrGetter<string>) {
  return useQuery(() => discoverQuery(toValue(term).trim()));
}

function useMediaInvalidation() {
  const cache = useQueryCache();
  return () => Promise.all(MEDIA_KEYS.map((key) => cache.invalidateQueries({ key })));
}

export function useRequestMedia() {
  const invalidate = useMediaInvalidation();
  return useMutation({
    mutation: (item: DiscoverResult) => requestMedia(item),
    onSettled: invalidate,
  });
}

export function useRemoveLibraryItem() {
  const invalidate = useMediaInvalidation();
  return useMutation({
    mutation: (item: LibraryItem) => removeLibraryItem(item, true),
    onSettled: invalidate,
  });
}
