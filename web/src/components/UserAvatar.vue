<template>
  <div
    v-if="isKyle"
    class="avatar-kyle flex shrink-0 items-center justify-center text-[0.8125rem] font-bold"
  >
    K
  </div>
  <div
    v-else
    class="flex size-8 shrink-0 items-center justify-center rounded-full text-[0.8125rem] font-bold text-bg-base"
    :style="{ background: color }"
  >
    {{ letter }}
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{ name: string }>();

const AVATAR_COLORS = [
  "#60a5fa",
  "#34d399",
  "#f87171",
  "#fbbf24",
  "#a78bfa",
  "#22d3ee",
  "#fb923c",
  "#e879f9",
];

const isKyle = computed(() => props.name === "Kyle");

const color = computed(() => {
  const cp = props.name.codePointAt(0) ?? 0;
  return AVATAR_COLORS[cp % AVATAR_COLORS.length]!;
});

const letter = computed(() => {
  const first = String.fromCodePoint(props.name.codePointAt(0) ?? 63);
  return /\p{L}/u.test(first) ? first.toUpperCase() : "?";
});
</script>

<style scoped>
.avatar-kyle {
  width: 32px;
  height: 32px;
  background: var(--color-accent-purple);
  border-radius: 8px;
  border: 1.5px solid color-mix(in srgb, var(--color-accent-purple) 50%, white);
  color: var(--color-bg-base);
}
</style>
