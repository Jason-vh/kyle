import { afterEach, describe, expect, test, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { createPinia } from "pinia";
import { PiniaColada } from "@pinia/colada";
import NotificationBell from "./NotificationBell.vue";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

function stub(unread: number, items: unknown[]) {
  const posted: string[] = [];
  globalThis.fetch = vi.fn((url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      posted.push(url);
      return Promise.resolve(new Response(JSON.stringify({ read: unread })));
    }
    return Promise.resolve(new Response(JSON.stringify({ notifications: items, unread })));
  }) as unknown as typeof fetch;
  return posted;
}

const notification = (overrides = {}) => ({
  id: "n1",
  mediaType: "movie",
  title: "Inception (2010)",
  body: "It is ready to watch.",
  read: false,
  createdAt: new Date().toISOString(),
  ...overrides,
});

async function render() {
  const bell = mount(NotificationBell, {
    global: { plugins: [createPinia(), [PiniaColada, {}]] },
    attachTo: document.body,
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  return bell;
}

describe("NotificationBell", () => {
  test("says nothing when there is nothing unread", async () => {
    stub(0, []);
    const bell = await render();

    expect(bell.get("button").attributes("aria-label")).toBe("Notifications");
    expect(bell.text()).toBe("");
  });

  // The count has to be readable, not just visible as a dot.
  test("counts what is unread, for eyes and for screen readers", async () => {
    stub(3, [notification()]);
    const bell = await render();

    expect(bell.text()).toContain("3");
    expect(bell.get("button").attributes("aria-label")).toBe("Notifications, 3 unread");
  });

  test("caps the badge rather than letting it grow", async () => {
    stub(42, [notification()]);
    const bell = await render();

    expect(bell.text()).toContain("9+");
  });

  test("opening it shows what arrived", async () => {
    stub(1, [notification()]);
    const bell = await render();

    await bell.get("button").trigger("click");
    await nextTick();

    expect(document.body.textContent).toContain("Inception (2010)");
    expect(document.body.textContent).toContain("It is ready to watch.");
  });

  test("marking all read tells the server", async () => {
    const posted = stub(1, [notification()]);
    const bell = await render();

    await bell.get("button").trigger("click");
    await nextTick();

    const markAll = [...document.body.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === "Mark all read",
    );
    markAll?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(posted).toEqual(["/api/notifications/read"]);
  });

  test("offers nothing to mark when everything is read", async () => {
    stub(0, [notification({ read: true })]);
    const bell = await render();

    await bell.get("button").trigger("click");
    await nextTick();

    const labels = [...document.body.querySelectorAll("button")].map((b) => b.textContent?.trim());
    expect(labels).not.toContain("Mark all read");
  });
});
