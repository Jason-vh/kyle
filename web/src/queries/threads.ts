import { defineQueryOptions, useQuery } from "@pinia/colada";
import type { MaybeRefOrGetter } from "vue";
import { toValue } from "vue";
import { getThread, getThreads } from "#web/api/threads";

export const threadsQuery = defineQueryOptions({
  key: ["threads"],
  query: getThreads,
  staleTime: 30_000,
});

export const threadQuery = defineQueryOptions((params: { id: string }) => ({
  key: ["threads", params.id],
  query: () => getThread(params.id),
  // A thread only grows, so revisiting one should not wait on the network.
  staleTime: 30_000,
}));

export function useThreads() {
  return useQuery(threadsQuery);
}

export function useThread(params: MaybeRefOrGetter<{ id: string }>) {
  return useQuery(() => threadQuery(toValue(params)));
}
