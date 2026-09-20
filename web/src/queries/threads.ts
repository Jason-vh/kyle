import { defineQueryOptions } from "@pinia/colada";
import { useAccountQuery } from "./account";
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
  return useAccountQuery(threadsQuery);
}

export function useThread(params: MaybeRefOrGetter<{ id: string }>) {
  return useAccountQuery(() => threadQuery(toValue(params)));
}
