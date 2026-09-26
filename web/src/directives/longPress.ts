import type { Directive } from "vue";

/** Long enough not to be a tap, short enough not to feel like waiting. */
export const HOLD_MS = 500;

/** A finger that wanders further than this is scrolling, not holding. */
const SLOP_PX = 10;

interface Press {
  handler: () => void;
  timer?: ReturnType<typeof setTimeout>;
  x: number;
  y: number;
  /** The press became a hold, so the click it ends in is not a tap. */
  held: boolean;
  release: () => void;
}

const presses = new WeakMap<HTMLElement, Press>();

/**
 * `v-long-press="open"`: holding the element, or right-clicking it, calls
 * `open`. The click a hold ends in is swallowed, so whatever a tap does is not
 * done as well. Android fires `contextmenu` on a hold and iOS does not, so
 * whichever comes first wins and the other is ignored.
 */
export const vLongPress: Directive<HTMLElement, () => void> = {
  mounted(el, binding) {
    const press: Press = { handler: binding.value, x: 0, y: 0, held: false, release: () => {} };

    const cancel = () => {
      clearTimeout(press.timer);
      press.timer = undefined;
    };

    const hold = () => {
      cancel();
      press.held = true;
      navigator.vibrate?.(10);
      press.handler();
    };

    const onDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      press.held = false;
      press.x = event.clientX;
      press.y = event.clientY;
      press.timer = setTimeout(hold, HOLD_MS);
    };

    const onMove = (event: PointerEvent) => {
      if (!press.timer) return;
      if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > SLOP_PX) cancel();
    };

    const onClick = (event: MouseEvent) => {
      if (!press.held) return;
      press.held = false;
      event.preventDefault();
      event.stopPropagation();
    };

    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      if (!press.held) hold();
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", cancel);
    el.addEventListener("pointercancel", cancel);
    el.addEventListener("pointerleave", cancel);
    el.addEventListener("click", onClick, true);
    el.addEventListener("contextmenu", onContextMenu);

    press.release = () => {
      cancel();
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", cancel);
      el.removeEventListener("pointercancel", cancel);
      el.removeEventListener("pointerleave", cancel);
      el.removeEventListener("click", onClick, true);
      el.removeEventListener("contextmenu", onContextMenu);
    };

    presses.set(el, press);
  },

  updated(el, binding) {
    const press = presses.get(el);
    if (press) press.handler = binding.value;
  },

  unmounted(el) {
    presses.get(el)?.release();
    presses.delete(el);
  },
};
