import { useQueryCache } from "@pinia/colada";
import { pinia } from "#web/pinia";
import { router } from "#web/router";

export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (res.status === 401) {
    // The session the whole app reads is now wrong, whatever it says.
    useQueryCache(pinia).invalidateQueries({ key: ["session"] });
    await router.push({ name: "login" });
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((body as { error?: string }).error ?? res.statusText);
  }

  return res.json() as Promise<T>;
}
