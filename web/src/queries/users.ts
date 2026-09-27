import { defineQueryOptions, useMutation, useQueryCache } from "@pinia/colada";
import { useAccountQuery } from "./account";
import { deleteUser, getUsers, mergeUsers, renameUser, unlinkIdentity } from "#web/api/users";

export const usersQuery = defineQueryOptions({ key: ["users"], query: getUsers });

export function useUsers() {
  return useAccountQuery(usersQuery);
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
export const useDeleteUser = () => useUsersMutation(deleteUser);
export const useUnlinkIdentity = () => useUsersMutation(unlinkIdentity);
