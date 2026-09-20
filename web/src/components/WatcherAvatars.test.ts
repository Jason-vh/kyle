import { afterEach, describe, expect, test } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import type { Watcher } from "#shared/types";
import WatcherAvatars from "./WatcherAvatars.vue";

const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

let mounted: VueWrapper | undefined;

// The card renders through a portal into the body, which would otherwise
// carry one test's names into the next.
afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  document.body.innerHTML = "";
});

function render(watchers: Watcher[], max?: number) {
  mounted = mount(WatcherAvatars, { props: { watchers, max }, attachTo: document.body });
  return mounted;
}

/** The card only exists once hovered, and it renders through a portal. */
async function hover(watchers: Watcher[], max?: number) {
  const avatars = render(watchers, max);
  await avatars.find("[aria-label]").trigger("pointerenter");
  await new Promise((resolve) => setTimeout(resolve, 200));
  return document.body.textContent ?? "";
}

function card(): string {
  return document.querySelector("ul")?.textContent ?? "";
}

describe("WatcherAvatars", () => {
  test("renders nothing at all when nobody has watched", () => {
    expect(render([]).html()).toBe("<!--v-if-->");
  });

  test("stacks a face per watcher up to the limit, then counts the rest", () => {
    const avatars = render([{ name: "A" }, { name: "B" }, { name: "C" }, { name: "D" }], 3);

    expect(avatars.findAll("img, .bg-accent-purple")).toHaveLength(3);
    expect(avatars.text()).toContain("+1");
  });

  test("names everyone for a screen reader, including those not shown", () => {
    const avatars = render([{ name: "Jason" }, { name: "Kate" }, { name: "Sam" }], 2);

    expect(avatars.find("[aria-label]").attributes("aria-label")).toBe(
      "Jason, Kate and Sam have watched this",
    );
  });

  test("says 'has' for a single watcher", () => {
    const avatars = render([{ name: "Jason" }]);

    expect(avatars.find("[aria-label]").attributes("aria-label")).toBe("Jason has watched this");
  });

  test("lists every watcher on hover, not only the ones on show", async () => {
    const text = await hover([{ name: "Jason" }, { name: "Kate" }, { name: "Sam" }], 2);

    expect(text).toContain("Jason");
    expect(text).toContain("Kate");
    expect(text).toContain("Sam");
  });

  test("says when each of them watched it", async () => {
    const text = await hover([
      { name: "Jason", watchedAt: ago(0.1) },
      { name: "Kate", watchedAt: ago(30) },
    ]);

    expect(text).toContain("h ago");
    expect(text).toMatch(/[A-Z][a-z]{2} \d+/);
  });

  test("leaves the time out for a watcher Plex gave no date for", async () => {
    await hover([{ name: "Jason" }]);

    expect(card()).toContain("Jason");
    expect(card()).not.toContain("ago");
  });
});
