import { afterEach, describe, expect, test, vi } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import { PiniaColada, useQueryCache } from "@pinia/colada";
import { useSession } from "./session";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

function stubAuth(body: unknown) {
  const calls = { count: 0 };
  globalThis.fetch = vi.fn(() => {
    calls.count++;
    return Promise.resolve(new Response(JSON.stringify(body)));
  }) as unknown as typeof fetch;
  return calls;
}

/** A component that does nothing but read the session, rendered its own way. */
const Reader = defineComponent({
  setup() {
    const { user, isAdmin } = useSession();
    return () => h("div", `${user.value?.name ?? "nobody"}|${isAdmin.value}`);
  },
});

function render(component = Reader) {
  const pinia = createPinia();
  return mount(component, { global: { plugins: [pinia, [PiniaColada, {}]] } });
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("useSession", () => {
  test("reports who is signed in", async () => {
    stubAuth({ authenticated: true, user: { id: "u1", name: "Jane", admin: true } });

    const reader = render();
    await flush();

    expect(reader.text()).toBe("Jane|true");
  });

  test("reports nobody when the request fails", async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new Error("offline"))) as unknown as typeof fetch;

    const reader = render();
    await flush();

    // Signed out rather than a thrown error, so a flaky connection sends you
    // to the login page instead of a broken app.
    expect(reader.text()).toBe("nobody|false");
  });

  // The header, the router guard and three views all ask; one request answers.
  test("several readers share a single request", async () => {
    const calls = stubAuth({ authenticated: true, user: { id: "u1", name: "Jane", admin: false } });

    const Three = defineComponent({
      setup: () => () => h("div", [h(Reader), h(Reader), h(Reader)]),
    });
    render(Three);
    await flush();

    expect(calls.count).toBe(1);
  });

  test("invalidating it asks again, so signing out is not remembered", async () => {
    const calls = stubAuth({ authenticated: true, user: { id: "u1", name: "Jane", admin: false } });

    const reader = render();
    await flush();
    expect(calls.count).toBe(1);

    await useQueryCache().invalidateQueries({ key: ["session"] });
    await flush();

    expect(calls.count).toBe(2);
    reader.unmount();
  });
});
