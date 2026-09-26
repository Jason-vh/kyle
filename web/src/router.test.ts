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
  for (const entry of Array.from(cache.caches.values())) cache.remove(entry);

  await router.push("/login");
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

function stubAuth(authenticated: boolean, admin = false) {
  const calls = { count: 0 };
  globalThis.fetch = vi.fn(() => {
    calls.count++;
    return Promise.resolve(
      new Response(JSON.stringify({ authenticated, user: { id: "u1", name: "Jane", admin } })),
    );
  }) as unknown as typeof fetch;
  return calls;
}

describe("scrolling", () => {
  // Opening a title from halfway down the library used to land halfway down it.
  test("a new page starts at the top", () => {
    const to = { path: "/media/movie/1" } as never;
    const from = { path: "/library" } as never;

    expect(router.options.scrollBehavior?.(to, from, null)).toEqual({ top: 0 });
  });

  test("changing only the query keeps the place", () => {
    const to = { path: "/library" } as never;
    const from = { path: "/library" } as never;

    expect(router.options.scrollBehavior?.(to, from, null)).toBe(false);
  });

  test("going back returns to where you left off", () => {
    const saved = { left: 0, top: 640 };

    expect(router.options.scrollBehavior?.({} as never, {} as never, saved)).toBe(saved);
  });
});

describe("the media route", () => {
  test("carries the type and id of the title", async () => {
    stubAuth(true);

    await router.push("/media/series/95396");

    expect(router.currentRoute.value.name).toBe("media");
    expect(router.currentRoute.value.params).toEqual({ mediaType: "series", tmdbId: "95396" });
  });

  // The page can only ask about a movie or a series, by numeric TMDB id.
  test("does not match anything else", async () => {
    stubAuth(true);

    await router.push("/media/album/95396");

    expect(router.currentRoute.value.matched).toEqual([]);
  });
});

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
});

// Threads are everyone's conversations with Kyle, not everyone's to read.
describe("the admin guard", () => {
  test("lets an admin read the threads", async () => {
    stubAuth(true, true);

    await router.push("/threads");

    expect(router.currentRoute.value.name).toBe("threads");
  });

  test("sends anyone else home", async () => {
    stubAuth(true, false);

    await router.push("/threads");

    expect(router.currentRoute.value.name).toBe("home");
  });

  test("guards one thread as closely as the list", async () => {
    stubAuth(true, false);

    await router.push("/threads/abc");

    expect(router.currentRoute.value.name).toBe("home");
  });

  test("is not talked out of it by a ?sig= link, which no longer means anything", async () => {
    stubAuth(true, false);

    await router.push("/threads/abc?sig=signature");

    expect(router.currentRoute.value.name).toBe("home");
  });

  test("leaves pages that are everyone's alone", async () => {
    stubAuth(true, false);

    await router.push("/library");

    expect(router.currentRoute.value.name).toBe("library");
  });
});
