import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createApp } from "vue";
import { PiniaColada, useQueryCache } from "@pinia/colada";
import { pinia } from "./pinia";
import { router } from "./router";

const realFetch = globalThis.fetch;

/**
 * The guard reads the session through the app's own pinia rather than an
 * injected one, so the test installs onto that same instance and empties the
 * cache between tests — otherwise one test's session answers the next.
 */
beforeEach(async () => {
  createApp({ render: () => null })
    .use(pinia)
    .use(PiniaColada, {});

  const cache = useQueryCache(pinia);
  for (const entry of [...cache.caches.values()]) cache.remove(entry);

  await router.push("/login");
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

function stubAuth(authenticated: boolean) {
  const calls = { count: 0 };
  globalThis.fetch = vi.fn(() => {
    calls.count++;
    return Promise.resolve(
      new Response(
        JSON.stringify({ authenticated, user: { id: "u1", name: "Jane", admin: false } }),
      ),
    );
  }) as unknown as typeof fetch;
  return calls;
}

describe("the auth guard", () => {
  test("lets a signed-in visitor through", async () => {
    stubAuth(true);

    await router.push("/library");

    expect(router.currentRoute.value.name).toBe("library");
  });

  test("sends a signed-out visitor to the login page", async () => {
    stubAuth(false);

    await router.push("/library");

    expect(router.currentRoute.value.name).toBe("login");
  });

  // The guard and every view read one cache entry, so a navigation costs one
  // request in total rather than one per page.
  test("asks about the session once across several navigations", async () => {
    const calls = stubAuth(true);

    await router.push("/library");
    await router.push("/requests");
    await router.push("/home");

    expect(calls.count).toBe(1);
  });

  // Otherwise the page is unreachable for the person it was shared with.
  test("lets a shared thread link through unauthenticated", async () => {
    const calls = stubAuth(false);

    await router.push("/threads/abc?sig=signature");

    expect(router.currentRoute.value.name).toBe("thread");
    expect(calls.count).toBe(0);
  });
});
