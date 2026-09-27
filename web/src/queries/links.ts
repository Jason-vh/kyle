import { defineQueryOptions, useMutation, useQueryCache } from "@pinia/colada";
import { useAccountQuery } from "./account";
import { createLinkCode, getAccountLinks, unlinkAccount } from "#web/api/links";

export const linksQuery = defineQueryOptions({ key: ["account-links"], query: getAccountLinks });

export function useAccountLinks() {
  return useAccountQuery(linksQuery);
}

export function useCreateLinkCode() {
  return useMutation({ mutation: createLinkCode });
}

export function useUnlinkAccount() {
  const cache = useQueryCache();
  return useMutation({
    mutation: unlinkAccount,
    onSettled: () => cache.invalidateQueries({ key: linksQuery.key }),
  });
}
