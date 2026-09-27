<template>
  <img
    v-if="src"
    :src="src"
    :alt="name"
    loading="lazy"
    class="shrink-0 rounded-full object-cover"
    :class="SIZES[size]"
  />
  <div
    v-else
    class="flex shrink-0 items-center justify-center rounded-full font-semibold text-text-inverse"
    :class="[SIZES[size], LETTER_SIZES[size]]"
    :style="{ background: avatarColor }"
  >
    {{ letter }}
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{ name: string; src?: string | null; size?: "md" | "lg" }>(),
  { size: "md" },
);

const SIZES = { md: "size-8", lg: "size-16" };
const LETTER_SIZES = { md: "text-sm", lg: "text-2xl" };

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
