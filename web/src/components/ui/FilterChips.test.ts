import { describe, expect, test } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import FilterChips from "./FilterChips.vue";

const OPTIONS = [
  { value: "all", label: "All" },
  { value: "movie", label: "Movies" },
] as const;

const render = (modelValue = "all") =>
  mount(FilterChips, {
    props: { modelValue, options: OPTIONS, label: "Filter the library" },
    attachTo: document.body,
  });

describe("FilterChips", () => {
  test("announces itself as a group with a name", () => {
    const chips = render();
    expect(chips.get("[role=group]").attributes("aria-label")).toBe("Filter the library");
  });

  test("marks which one is chosen for a screen reader", () => {
    const chips = render("movie");
    const states = chips.findAll("button").map((b) => b.attributes("data-state"));
    expect(states).toEqual(["off", "on"]);
  });

  test("choosing one reports it", async () => {
    const chips = render();
    await chips.findAll("button")[1]!.trigger("click");

    expect(chips.emitted("update:modelValue")).toEqual([["movie"]]);
  });

  // A toggle group lets you turn the active item off, which would leave the
  // list filtered by nothing at all.
  test("clicking the chosen one again changes nothing", async () => {
    const chips = render();
    await chips.findAll("button")[0]!.trigger("click");

    expect(chips.emitted("update:modelValue")).toBeUndefined();
  });

  // Arrow keys within the group, not tab-through-every-chip — the reason this
  // is a toggle group rather than a row of buttons.
  test("the group is a single tab stop", async () => {
    const chips = render("all");
    await nextTick();

    expect(chips.get("[role=group]").attributes("tabindex")).toBe("0");
  });

  test("each chip says whether it is pressed", () => {
    const chips = render("movie");
    const pressed = chips.findAll("button").map((b) => b.attributes("aria-pressed"));
    expect(pressed).toEqual(["false", "true"]);
  });
});
