import { describe, expect, test } from "vitest";
import { mount } from "@vue/test-utils";
import MediaPoster from "./MediaPoster.vue";

const render = (src?: string | null) => mount(MediaPoster, { props: { src, alt: "Inception" } });

describe("MediaPoster", () => {
  // Otherwise the artwork appears mid-decode, over its own placeholder.
  test("keeps the image invisible until it has loaded", async () => {
    const poster = render("https://img/poster.jpg");
    expect(poster.find("img").classes()).toContain("opacity-0");

    await poster.find("img").trigger("load");
    expect(poster.find("img").classes()).toContain("opacity-100");
  });

  test("falls back to the placeholder when the image fails", async () => {
    const poster = render("https://img/gone.jpg");

    await poster.find("img").trigger("error");

    expect(poster.find("img").exists()).toBe(false);
    expect(poster.text()).toContain("No art");
  });

  test("shows the placeholder when there is nothing to show", () => {
    expect(render(null).text()).toContain("No art");
  });
});
