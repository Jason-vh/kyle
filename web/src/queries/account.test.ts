import { afterEach, expect, test, vi } from "vitest";
import { defineComponent, h } from "vue";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createPinia } from "pinia";
import { PiniaColada, useQueryCache } from "@pinia/colada";
import type { AuthStatus } from "#web/api/auth";
import { useAccountQuery } from "./account";
import { sessionQuery } from "./session";

const realFetch = globalThis.fetch;
const wrappers: VueWrapper[] = [];
let session: AuthStatus;
const load = vi.fn<() => Promise<string>>();

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
  load.mockReset();
});

async function render() {
  globalThis.fetch = vi.fn(async () => Response.json(session)) as unknown as typeof fetch;
  const pinia = createPinia();
  const reader = mount(
    defineComponent({
      setup() {
        const { data } = useAccountQuery({ key: ["private"], query: load, staleTime: Infinity });
        return () => h("div", data.value ?? "empty");
      },
    }),
    { global: { plugins: [pinia, [PiniaColada, {}]] } },
  );
  wrappers.push(reader);
  await flushPromises();
  return { reader, cache: useQueryCache(pinia) };
}

function signIn(id: string, admin = false) {
  session = { authenticated: true, user: { id, name: id, admin } };
}

test("switching accounts never reuses the previous account's fresh data", async () => {
  signIn("alice");
  load.mockResolvedValueOnce("Alice's requests").mockResolvedValueOnce("Bob's requests");
  const { reader, cache } = await render();
  expect(reader.text()).toBe("Alice's requests");

  signIn("bob");
  await cache.invalidateQueries({ key: sessionQuery.key });
  await flushPromises();

  expect(reader.text()).toBe("Bob's requests");
  expect(load).toHaveBeenCalledTimes(2);
  expect(cache.getQueryData(["private", "alice", false])).toBeUndefined();
});

test("logout clears cached data and disables protected queries", async () => {
  signIn("alice");
  load.mockResolvedValue("Alice's notifications");
  const { reader, cache } = await render();
  expect(reader.text()).toBe("Alice's notifications");

  session = { authenticated: false };
  await cache.invalidateQueries({ key: sessionQuery.key });
  await flushPromises();

  expect(reader.text()).toBe("empty");
  expect(load).toHaveBeenCalledTimes(1);
  expect(cache.getQueryData(["private", "alice", false])).toBeUndefined();
});

test("late responses from a previous account cannot refill the cache", async () => {
  signIn("alice");
  let resolve!: (value: string) => void;
  load.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  load.mockResolvedValueOnce("Bob's notifications");
  const { reader, cache } = await render();
  const oldEntry = cache.get(["private", "alice", false])!;

  signIn("bob");
  await cache.invalidateQueries({ key: sessionQuery.key });
  await flushPromises();
  resolve("Alice's notifications");
  await flushPromises();

  expect(reader.text()).toBe("Bob's notifications");
  expect(oldEntry.state.value.data).toBeUndefined();
  expect(cache.getQueryData(["private", "alice", false])).toBeUndefined();
});

test("a permission change discards privileged data for the same account", async () => {
  signIn("alice", true);
  load.mockResolvedValueOnce("Admin data").mockResolvedValueOnce("Member data");
  const { reader, cache } = await render();
  expect(reader.text()).toBe("Admin data");

  signIn("alice", false);
  await cache.invalidateQueries({ key: sessionQuery.key });
  await flushPromises();

  expect(reader.text()).toBe("Member data");
  expect(cache.getQueryData(["private", "alice", true])).toBeUndefined();
});

test("refreshing an unchanged session preserves its cache", async () => {
  signIn("alice");
  load.mockResolvedValue("Alice's data");
  const { reader, cache } = await render();
  await cache.invalidateQueries({ key: sessionQuery.key });
  await flushPromises();
  expect(reader.text()).toBe("Alice's data");
  expect(load).toHaveBeenCalledTimes(1);
});
