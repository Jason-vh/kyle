import { afterEach, describe, expect, test } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import ConfirmDialog from "./ConfirmDialog.vue";

const PROPS = {
  title: "Remove from the library?",
  description: "This removes “Inception” and deletes 24 GB from disk.",
  confirmLabel: "Remove",
};

/** The portal lands on the next tick, so every case has to wait for it. */
async function render(extra: Record<string, unknown> = {}) {
  const dialog = mount(ConfirmDialog, {
    props: { open: true, ...PROPS, ...extra },
    attachTo: document.body,
  });
  await nextTick();
  return dialog;
}

afterEach(() => {
  document.body.innerHTML = "";
});

/** The dialog portals to the body, so it is not inside the wrapper. */
const dialog = () => document.body.querySelector("[role=alertdialog]");

describe("ConfirmDialog", () => {
  test("shows nothing until it is opened", async () => {
    mount(ConfirmDialog, { props: { open: false, ...PROPS }, attachTo: document.body });
    await nextTick();
    expect(dialog()).toBeNull();
  });

  // The whole reason for replacing window.confirm: it can say what it is about
  // to delete, and how much.
  test("names what is about to happen", async () => {
    await render();
    expect(dialog()?.textContent).toContain("Remove from the library?");
    expect(dialog()?.textContent).toContain("deletes 24 GB from disk");
  });

  test("is described to a screen reader by its own title and body", async () => {
    await render();
    expect(dialog()?.getAttribute("aria-labelledby")).toBeTruthy();
    expect(dialog()?.getAttribute("aria-describedby")).toBeTruthy();
  });

  test("confirming asks the caller to act rather than acting", async () => {
    const confirm = await render();
    const button = [...document.body.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === "Remove",
    );
    button?.click();
    await confirm.vm.$nextTick();

    expect(confirm.emitted("confirm")).toHaveLength(1);
    // Still open: the caller closes it once the work is done or has failed.
    expect(confirm.emitted("update:open")).toBeUndefined();
  });

  test("both buttons are disabled while the work is running", async () => {
    await render({ busy: true, busyLabel: "Removing…" });
    const buttons = [...document.body.querySelectorAll("button")];
    expect(buttons.every((b) => b.disabled)).toBe(true);
    expect(dialog()?.textContent).toContain("Removing…");
  });
});
