import { describe, expect, test } from "vitest";
import { mount } from "@vue/test-utils";
import QueryState from "./QueryState.vue";

const CONTENT = "<ul><li>a title</li></ul>";

const render = (props: Record<string, unknown>) =>
  mount(QueryState, { props, slots: { default: CONTENT } });

describe("QueryState", () => {
  test("shows the content when there is nothing else to say", () => {
    expect(render({}).text()).toContain("a title");
  });

  test("loading and empty never show the content", () => {
    expect(render({ loading: true }).text()).not.toContain("a title");
    expect(render({ empty: true }).text()).not.toContain("a title");
  });

  // A failed load that still rendered its list would show stale data as fact.
  test("an error replaces the content", () => {
    const state = render({ error: "Radarr is unreachable" });
    expect(state.text()).toContain("Radarr is unreachable");
    expect(state.text()).not.toContain("a title");
  });

  test("loading wins over an error, so a retry does not flash the old failure", () => {
    expect(render({ loading: true, error: "gone wrong" }).text()).not.toContain("gone wrong");
  });

  test("the empty message can be replaced by a slot", () => {
    const state = mount(QueryState, {
      props: { empty: true },
      slots: { empty: "Request something" },
    });
    expect(state.text()).toBe("Request something");
  });
});
