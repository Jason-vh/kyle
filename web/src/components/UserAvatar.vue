<template>
  <div
    class="flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-text-inverse"
    :style="{ background: avatarColor }"
  >
    {{ letter }}
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{ name: string }>();

const AVATAR_COLORS = [
  "#2563EB",
  "#059669",
  "#DC2626",
  "#D97706",
  "#7C3AED",
  "#0891B2",
  "#EA580C",
  "#C026D3",
];

const isKyle = computed(() => props.name === "Kyle");

const avatarColor = computed(() => {
  if (isKyle.value) return "#7C3AED";
  const cp = props.name.codePointAt(0) ?? 0;
  return AVATAR_COLORS[cp % AVATAR_COLORS.length]!;
});

const letter = computed(() => {
  if (isKyle.value) return "K";
  const first = String.fromCodePoint(props.name.codePointAt(0) ?? 63);
  return /\p{L}/u.test(first) ? first.toUpperCase() : "?";
});
</script>
