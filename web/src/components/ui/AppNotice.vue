<template>
  <p class="rounded-card px-3.5 py-2.5 text-sm" :class="TONES[tone]">
    <slot />
  </p>
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
