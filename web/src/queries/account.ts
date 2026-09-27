import { useQuery, type DefineQueryOptions } from "@pinia/colada";
import { toValue, type MaybeRefOrGetter } from "vue";
import type { AuthUser } from "#web/api/auth";
import { useSession } from "./session";

export function forAccount<T>(query: DefineQueryOptions<T>, user: AuthUser | null) {
  return {
    ...query,
    key: [...query.key, user?.id ?? null, user?.admin ?? false],
    enabled: !!user && query.enabled !== false,
  };
}

export function useAccountQuery<T>(options: MaybeRefOrGetter<DefineQueryOptions<T>>) {
  const { user } = useSession();
  return useQuery(() => forAccount(toValue(options), user.value));
}
