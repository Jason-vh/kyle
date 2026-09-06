import { computed } from "vue";
import { defineQueryOptions, useQuery, useQueryCache } from "@pinia/colada";
import { fetchAuthStatus } from "#web/api/auth";

export const sessionQuery = defineQueryOptions({
  key: ["session"],
  query: fetchAuthStatus,
  // Signing in and out invalidate this explicitly, so it does not need to be
  // re-asked on a schedule.
  staleTime: Infinity,
});

/**
 * Who is signed in, shared by every view that asks. One request, however many
 * components read it, and it changes when sign-in changes rather than when the
 * route does.
 */
export function useSession() {
  const { data, isPending } = useQuery(sessionQuery);

  return {
    user: computed(() => data.value?.user ?? null),
    isAdmin: computed(() => data.value?.user?.admin ?? false),
    plexEnabled: computed(() => data.value?.plexEnabled ?? false),
    loading: isPending,
  };
}

/** Call after signing in, out, or linking an account. */
export function useSessionRefresh() {
  const cache = useQueryCache();
  return () => cache.invalidateQueries({ key: sessionQuery.key });
}
