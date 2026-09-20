import { defineQueryOptions, useMutation, useQueryCache } from "@pinia/colada";
import { useAccountQuery } from "./account";
import { getNotifications, markNotificationsRead } from "#web/api/notifications";

export const notificationsQuery = defineQueryOptions({
  key: ["notifications"],
  query: getNotifications,
  // Short, because this is the one thing on the page that is meant to arrive.
  staleTime: 30_000,
});

export function useNotifications() {
  return useAccountQuery(notificationsQuery);
}

export function useMarkNotificationsRead() {
  const cache = useQueryCache();
  return useMutation({
    mutation: markNotificationsRead,
    onSettled: () => cache.invalidateQueries({ key: notificationsQuery.key }),
  });
}
