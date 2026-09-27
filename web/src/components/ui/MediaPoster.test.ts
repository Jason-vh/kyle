import { describe, expect, test } from "vitest";
import { mount } from "@vue/test-utils";
import MediaPoster from "./MediaPoster.vue";

const render = (path?: string | null) => mount(MediaPoster, { props: { path, alt: "Inception" } });

describe("MediaPoster", () => {
  // Otherwise the artwork appears mid-decode, over its own placeholder.
  test("keeps the image invisible until it has loaded", async () => {
    const poster = render("/poster.jpg");
    expect(poster.find("img").classes()).toContain("opacity-0");

    await poster.find("img").trigger("load");
    expect(poster.find("img").classes()).toContain("opacity-100");
  });

  test("falls back to the placeholder when the image fails", async () => {
    const poster = render("/gone.jpg");

    await poster.find("img").trigger("error");

    expect(poster.find("img").exists()).toBe(false);
    expect(poster.text()).toContain("No art");
  });

  test("offers every poster width, and says how wide it is drawn", () => {
    const img = render("/poster.jpg").find("img");

    expect(img.attributes("src")).toBe("https://image.tmdb.org/t/p/w342/poster.jpg");
    expect(img.attributes("srcset")).toBe(
      [92, 154, 185, 342]
        .map((w) => `https://image.tmdb.org/t/p/w${w}/poster.jpg ${w}w`)
        .join(", "),
    );
    expect(img.attributes("sizes")).toBe("48px");
  });

  test("shows the placeholder when there is nothing to show", () => {
    expect(render(null).text()).toContain("No art");
  });
});
