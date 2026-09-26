<template>
  <div class="relative" @focusout="onFocusOut">
    <div
      v-if="!disabled"
      class="absolute inset-y-0 right-0 flex items-center"
      :class="{ 'transition-[scale] duration-300 ease-out': drag === null }"
      :style="{ width: `${ACTION_WIDTH}px`, scale: actionScale }"
      @focusin="emit('update:open', true)"
    >
      <slot name="action" />
    </div>
    <div
      class="relative touch-pan-y"
      :class="{ 'transition-transform duration-300 ease-out': drag === null }"
      :style="{ transform: `translateX(${offset}px)` }"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerCancel"
      @click.capture="onClickCapture"
    >
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";

const ACTION_WIDTH = 64;
const GAP = 8;
const OPEN_OFFSET = -(ACTION_WIDTH + GAP);
const RESTING_SCALE = 0.85;
const SLOP = 8;

const props = withDefaults(defineProps<{ open: boolean; disabled?: boolean }>(), {
  disabled: false,
});

const emit = defineEmits<{ "update:open": [boolean] }>();

const drag = ref<number | null>(null);
const offset = computed(() => {
  if (drag.value !== null) return drag.value;
  return props.open ? OPEN_OFFSET : 0;
});
const reveal = computed(() => Math.min(1, Math.max(0, offset.value / OPEN_OFFSET)));
const actionScale = computed(() => RESTING_SCALE + (1 - RESTING_SCALE) * reveal.value);

let start: { x: number; y: number; base: number } | null = null;
let axis: "x" | "y" | null = null;
let swiped = false;

function resist(x: number): number {
  if (x > 0) return x * 0.2;
  const past = OPEN_OFFSET - x;
  if (past > 0) return OPEN_OFFSET - past * 0.3;
  return x;
}

function onPointerDown(event: PointerEvent) {
  if (props.disabled || event.pointerType === "mouse") return;
  start = { x: event.clientX, y: event.clientY, base: offset.value };
  axis = null;
  swiped = false;
}

function onPointerMove(event: PointerEvent) {
  if (!start) return;
  const dx = event.clientX - start.x;
  const dy = event.clientY - start.y;

  if (axis === null) {
    if (Math.hypot(dx, dy) < SLOP) return;
    axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    if (axis === "x") (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }
  if (axis !== "x") return;

  swiped = true;
  drag.value = resist(start.base + dx);
}

function onPointerUp() {
  if (drag.value !== null) emit("update:open", drag.value < OPEN_OFFSET / 2);
  onPointerCancel();
}

function onPointerCancel() {
  drag.value = null;
  start = null;
  axis = null;
}

function onClickCapture(event: MouseEvent) {
  if (!swiped && !props.open) return;
  event.preventDefault();
  event.stopPropagation();
  if (!swiped) emit("update:open", false);
  swiped = false;
}

function onFocusOut(event: FocusEvent) {
  if (!props.open) return;
  const wrapper = event.currentTarget as HTMLElement;
  if (!wrapper.contains(event.relatedTarget as Node | null)) emit("update:open", false);
}
</script>
