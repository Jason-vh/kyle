<template>
  <div
    v-if="isKyle"
    class="avatar-kyle flex shrink-0 items-center justify-center font-serif text-sm italic"
  >
    K
  </div>
  <div
    v-else
    class="font-ui flex size-8 shrink-0 items-center justify-center text-[0.8125rem] font-bold text-white"
    :style="{ background: color }"
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
  border: 1.5px solid var(--color-accent-purple);
  border-radius: 50%;
  color: var(--color-accent-purple);
}
</style>
