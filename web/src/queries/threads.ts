import { defineQueryOptions, useQuery } from "@pinia/colada";
import type { MaybeRefOrGetter } from "vue";
import { toValue } from "vue";
import { getThread, getThreads } from "#web/api/threads";

export const threadsQuery = defineQueryOptions({
  key: ["threads"],
  query: getThreads,
  staleTime: 30_000,
});

/** A shared `?sig=` link reads the same thread without being signed in. */
export const threadQuery = defineQueryOptions((params: { id: string; sig?: string }) => ({
  key: ["threads", params.id],
  query: () => getThread(params.id, params.sig),
  // A thread only grows, so revisiting one should not wait on the network.
  staleTime: 30_000,
}));

export function useThreads() {
  return useQuery(threadsQuery);
}

export function useThread(params: MaybeRefOrGetter<{ id: string; sig?: string }>) {
  return useQuery(() => threadQuery(toValue(params)));
}
