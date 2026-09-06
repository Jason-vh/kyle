<template>
  <span
    class="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold"
    :class="TONES[tone]"
  >
    <slot />
  </span>
</template>

<script setup lang="ts">
import type { Tone } from "./types";

const TONES: Record<Tone, string> = {
  neutral: "bg-bg-elevated text-text-secondary",
  green: "bg-accent-green-light text-accent-green",
  amber: "bg-accent-amber-light text-accent-amber",
  red: "bg-accent-red-light text-accent-red",
  purple: "bg-accent-purple-light text-accent-purple",
  blue: "bg-accent-blue-light text-accent-blue",
};

withDefaults(defineProps<{ tone?: Tone }>(), { tone: "neutral" });
</script>
