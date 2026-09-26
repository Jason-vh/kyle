import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { defineComponent, h, withDirectives } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { HOLD_MS, vLongPress } from "./longPress";

let held = 0;
let tapped = 0;
let wrapper: VueWrapper;

const Target = defineComponent({
  render: () =>
    withDirectives(h("div", { onClick: () => tapped++ }, "Season 1"), [[vLongPress, () => held++]]),
});

const fire = (type: string, init: PointerEventInit = {}) =>
  wrapper.element.dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, ...init }));

beforeEach(() => {
  held = 0;
  tapped = 0;
  vi.useFakeTimers();
  wrapper = mount(Target, { attachTo: document.body });
});

afterEach(() => {
  wrapper.unmount();
  vi.useRealTimers();
});

describe("vLongPress", () => {
  test("a hold calls it, and the click it ends in is not a tap", () => {
    fire("pointerdown");
    vi.advanceTimersByTime(HOLD_MS);
    fire("pointerup");
    (wrapper.element as HTMLElement).click();

    expect(held).toBe(1);
    expect(tapped).toBe(0);
  });

  test("a tap is a tap", () => {
    fire("pointerdown");
    vi.advanceTimersByTime(HOLD_MS - 100);
    fire("pointerup");
    (wrapper.element as HTMLElement).click();

    expect(held).toBe(0);
    expect(tapped).toBe(1);
  });

  // A finger that moves is scrolling the page past the season, not holding it.
  test("a press that moves away is not a hold", () => {
    fire("pointerdown", { clientX: 0, clientY: 0 });
    fire("pointermove", { clientX: 0, clientY: 40 });
    vi.advanceTimersByTime(HOLD_MS);

    expect(held).toBe(0);
  });

  test("a right click calls it too, once", () => {
    wrapper.element.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
    );

    expect(held).toBe(1);
  });

  // Android fires contextmenu on a hold of its own, which must not open it twice.
  test("a hold that also raises a context menu calls it once", () => {
    fire("pointerdown");
    vi.advanceTimersByTime(HOLD_MS);
    wrapper.element.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
    );

    expect(held).toBe(1);
  });
});
