import { describe, expect, test } from "vitest";
import { mount } from "@vue/test-utils";
import AppButton from "./AppButton.vue";

describe("AppButton", () => {
  test("is secondary unless told otherwise", () => {
    expect(mount(AppButton).classes()).toContain("bg-bg-surface");
  });

  test.each(["primary", "secondary", "ghost", "danger"] as const)(
    "the %s variant renders a class of its own",
    (variant) => {
      expect(mount(AppButton, { props: { variant } }).attributes("class")).toBeTruthy();
    },
  );

  // Anything you press on a phone has to be reachable; `sm` is only for
  // controls that sit beside text and are never the only way to do something.
  test("is a 44px touch target at its default size", () => {
    expect(mount(AppButton).classes()).toContain("min-h-11");
    expect(mount(AppButton, { props: { size: "sm" } }).classes()).toContain("min-h-8");
  });

  test("loading disables it, so a slow action cannot be fired twice", () => {
    const button = mount(AppButton, { props: { loading: true } });
    expect(button.attributes("disabled")).toBeDefined();
  });

  test("is a plain button by default, so it cannot submit a form by accident", () => {
    expect(mount(AppButton).attributes("type")).toBe("button");
  });
});
