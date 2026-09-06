import { describe, expect, test } from "vitest";
import { mount } from "@vue/test-utils";
import { RouterLinkStub } from "@vue/test-utils";
import MediaTitle from "./MediaTitle.vue";

const render = (tmdbId?: number) =>
  mount(MediaTitle, {
    props: { mediaType: "series" as const, tmdbId, title: "Severance" },
    global: { stubs: { RouterLink: RouterLinkStub } },
  });

describe("MediaTitle", () => {
  test("links to the title's own page", () => {
    const link = render(95396).findComponent(RouterLinkStub);

    expect(link.props("to")).toEqual({
      name: "media",
      params: { mediaType: "series", tmdbId: 95396 },
    });
  });

  // The whole row is clickable, so the link has to cover it.
  test("stretches over the card it sits in", () => {
    expect(render(95396).find("a").classes()).toContain("after:inset-0");
  });

  // Media added by hand has no TMDB id, and so no page to open.
  test("is plain text when there is nothing to link to", () => {
    const title = render();

    expect(title.findComponent(RouterLinkStub).exists()).toBe(false);
    expect(title.text()).toBe("Severance");
  });
});
