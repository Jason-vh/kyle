import { defineQueryOptions, useMutation, useQueryCache } from "@pinia/colada";
import { toValue, type MaybeRefOrGetter } from "vue";
import { useAccountQuery } from "./account";
import {
  deleteUser,
  getPlexAccounts,
  getUserProfile,
  getUsers,
  linkPlexAccount,
  mergeUsers,
  renameUser,
  unlinkIdentity,
} from "#web/api/users";

export const usersQuery = defineQueryOptions({ key: ["users"], query: getUsers });

export function useUsers() {
  return useAccountQuery(usersQuery);
}

export const userProfileQuery = defineQueryOptions((id: string) => ({
  key: ["users", id],
  query: () => getUserProfile(id),
}));

export function useUserProfile(id: MaybeRefOrGetter<string>) {
  return useAccountQuery(() => userProfileQuery(toValue(id)));
}

function useUsersMutation<T>(mutation: (input: T) => Promise<void>) {
  const cache = useQueryCache();
  return useMutation({
    mutation,
    onSettled: () => cache.invalidateQueries({ key: usersQuery.key }),
  });
}

export const useRenameUser = () => useUsersMutation(renameUser);
export const useMergeUsers = () => useUsersMutation(mergeUsers);
export function useDeleteUser() {
  const cache = useQueryCache();
  return useMutation({
    mutation: deleteUser,
    onSettled: (_data, _error, id) =>
      cache.invalidateQueries({ key: usersQuery.key, predicate: (entry) => entry.key[1] !== id }),
  });
}
export const useUnlinkIdentity = () => useUsersMutation(unlinkIdentity);
export const useLinkPlexAccount = () => useUsersMutation(linkPlexAccount);

export const plexAccountsQuery = defineQueryOptions({
  key: ["users", "plex-accounts"],
  query: getPlexAccounts,
});

export function usePlexAccounts(enabled: () => boolean) {
  return useAccountQuery(() => ({ ...plexAccountsQuery, enabled: enabled() }));
}
