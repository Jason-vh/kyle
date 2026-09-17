import { defineQueryOptions, useMutation, useQuery, useQueryCache } from "@pinia/colada";
import { getPlexMembers, invitePlexMember, removePlexMember } from "#web/api/plex";

export const membersQuery = defineQueryOptions({
  key: ["members"],
  query: getPlexMembers,
  // Several calls to plex.tv behind one page; a minute of staleness spares
  // them without hiding a change anyone made here, which invalidates anyway.
  staleTime: 60_000,
});

export function useMembers() {
  return useQuery(membersQuery);
}

export function useInviteMember() {
  const cache = useQueryCache();
  return useMutation({
    mutation: invitePlexMember,
    onSettled: () => cache.invalidateQueries({ key: membersQuery.key }),
  });
}

export function useRemoveMember() {
  const cache = useQueryCache();
  return useMutation({
    mutation: removePlexMember,
    onSettled: () => cache.invalidateQueries({ key: membersQuery.key }),
  });
}
