import { defineQueryOptions, useMutation, useQueryCache } from "@pinia/colada";
import { useAccountQuery } from "./account";
import type { MaybeRefOrGetter } from "vue";
import { toValue } from "vue";
import type { LibraryMediaType } from "#shared/types";
import { getDashboard } from "#web/api/dashboard";
import {
  getLibrary,
  releaseSeason,
  removeLibraryItem,
  type ReleasableSeason,
  type RemovableItem,
} from "#web/api/library";
import { getMediaActivity, getMediaDetail } from "#web/api/media";
import {
  discover,
  getRequests,
  reportRequest,
  requestMedia,
  retryRequest,
  type RequestInput,
  type RetryInput,
} from "#web/api/requests";

/**
 * Everything a change to the library could be visible in. Adding or removing a
 * title touches the library listing, the requests list, the home screen and any
 * search result showing what is already held — so one mutation invalidates all
 * of them rather than each caller remembering which.
 */
const MEDIA_KEYS = [["library"], ["requests"], ["dashboard"], ["discover"], ["media"]];

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

export const mediaDetailQuery = defineQueryOptions(
  ({ mediaType, tmdbId }: { mediaType: LibraryMediaType; tmdbId: number }) => ({
    key: ["media", mediaType, String(tmdbId)],
    query: () => getMediaDetail(mediaType, tmdbId),
    staleTime: 30_000,
  }),
);

/** Under the title's own key, so whatever refreshes the title refreshes its log too. */
export const mediaActivityQuery = defineQueryOptions(
  ({ mediaType, tmdbId }: { mediaType: LibraryMediaType; tmdbId: number }) => ({
    key: ["media", mediaType, String(tmdbId), "activity"],
    query: () => getMediaActivity(mediaType, tmdbId),
    staleTime: 60_000,
  }),
);

export function useDashboard() {
  return useAccountQuery(dashboardQuery);
}

export function useLibrary() {
  return useAccountQuery(libraryQuery);
}

export function useRequests(all: MaybeRefOrGetter<boolean>) {
  return useAccountQuery(() => requestsQuery(toValue(all)));
}

export function useDiscover(term: MaybeRefOrGetter<string>) {
  return useAccountQuery(() => discoverQuery(toValue(term).trim()));
}

export function useMediaDetail(
  mediaType: MaybeRefOrGetter<LibraryMediaType>,
  tmdbId: MaybeRefOrGetter<number>,
) {
  return useAccountQuery(() =>
    mediaDetailQuery({ mediaType: toValue(mediaType), tmdbId: toValue(tmdbId) }),
  );
}

export function useMediaActivity(
  mediaType: MaybeRefOrGetter<LibraryMediaType>,
  tmdbId: MaybeRefOrGetter<number>,
) {
  return useAccountQuery(() =>
    mediaActivityQuery({ mediaType: toValue(mediaType), tmdbId: toValue(tmdbId) }),
  );
}

function useMediaInvalidation() {
  const cache = useQueryCache();
  return () => Promise.all(MEDIA_KEYS.map((key) => cache.invalidateQueries({ key })));
}

export function useRequestMedia() {
  const invalidate = useMediaInvalidation();
  return useMutation({
    mutation: (item: RequestInput) => requestMedia(item),
    onSettled: invalidate,
  });
}

export function useRetryRequest() {
  const invalidate = useMediaInvalidation();
  return useMutation({
    mutation: (item: RetryInput) => retryRequest(item),
    onSettled: invalidate,
  });
}

export function useReportRequest() {
  return useMutation({ mutation: (item: RetryInput) => reportRequest(item) });
}

export function useRemoveLibraryItem() {
  const invalidate = useMediaInvalidation();
  return useMutation({
    mutation: (item: RemovableItem) => removeLibraryItem(item, true),
    onSettled: invalidate,
  });
}

export function useReleaseSeason() {
  const invalidate = useMediaInvalidation();
  return useMutation({
    mutation: (season: ReleasableSeason) => releaseSeason(season),
    onSettled: invalidate,
  });
}
