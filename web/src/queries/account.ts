import { useQuery, type DefineQueryOptions } from "@pinia/colada";
import { toValue, type MaybeRefOrGetter } from "vue";
import { useSession } from "./session";

export function useAccountQuery<T>(options: MaybeRefOrGetter<DefineQueryOptions<T>>) {
  const { user } = useSession();
  return useQuery(() => {
    const query = toValue(options);
    return {
      ...query,
      key: [...query.key, user.value?.id ?? null, user.value?.admin ?? false],
      enabled: !!user.value && query.enabled !== false,
    };
  });
}
