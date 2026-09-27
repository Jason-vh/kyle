import { afterEach, describe, expect, test, vi } from "vitest";
import { flushPromises, mount, RouterLinkStub } from "@vue/test-utils";
import { createPinia } from "pinia";
import { PiniaColada } from "@pinia/colada";
import type { AdminUser, UserFootprint } from "#shared/types";
import UserRow from "./UserRow.vue";

const footprint: UserFootprint = {
  identities: 2,
  passkeys: 2,
  requests: 11,
  conversations: 0,
  messages: 0,
  mediaEvents: 0,
  movieSubscriptions: 0,
  seriesSubscriptions: 0,
  notifications: 0,
  plexInvites: 0,
  removals: 0,
  plexAccounts: 0,
};

const jordan: AdminUser = {
  id: "u1",
  displayName: "Jordan",
  avatarUrl: "https://plex.tv/jordan.png",
  isAdmin: false,
  createdAt: "2026-03-01T00:00:00Z",
  identities: [
    { id: "i1", platform: "slack", platformUserId: "U1", platformUsername: "jordan" },
    { id: "i2", platform: "discord", platformUserId: "D1", platformUsername: null },
  ],
  footprint,
  requestedBytes: 18_400_000_000,
};

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

function render(user: AdminUser = jordan, signedInAs = "someone-else") {
  globalThis.fetch = vi.fn(() =>
    Promise.resolve(Response.json({ authenticated: true, user: { id: signedInAs, admin: true } })),
  ) as unknown as typeof fetch;
  return mount(UserRow, {
    props: { user },
    global: {
      plugins: [createPinia(), [PiniaColada, {}]],
      stubs: { RouterLink: RouterLinkStub },
    },
  });
}

describe("UserRow", () => {
  test("opens their page", () => {
    expect(render().findComponent(RouterLinkStub).props("to")).toBe("/people/u1");
  });

  test("shows their Plex avatar", () => {
    const row = render();
    expect(row.find("img").attributes("src")).toBe("https://plex.tv/jordan.png");
  });

  test("marks each linked account and their passkeys", () => {
    const row = render();
    const labels = row.findAll('[role="img"]').map((icon) => icon.attributes("aria-label"));
    expect(labels).toEqual(["Slack: jordan", "Discord: D1", "2 passkeys"]);
  });

  test("says how much their requests take up", () => {
    expect(render().text()).toContain("18 GB requested");
    expect(render({ ...jordan, requestedBytes: 0 }).text()).not.toContain("requested");
  });

  test("marks the person looking at the list", async () => {
    const mine = render(jordan, "u1");
    await flushPromises();
    expect(mine.text()).toContain("You");

    const theirs = render(jordan, "someone-else");
    await flushPromises();
    expect(theirs.text()).not.toContain("You");
  });
});
