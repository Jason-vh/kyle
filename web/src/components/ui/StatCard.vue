<template>
  <AppCard>
    <p class="text-xs font-semibold tracking-wide text-text-muted uppercase">{{ label }}</p>
    <p class="mt-1.5 text-2xl leading-tight font-semibold" :class="VALUE_TONES[tone]">
      {{ value }}
    </p>
    <p v-if="hint" class="mt-0.5 truncate text-xs text-text-muted">{{ hint }}</p>
    <!-- A bar only appears where a figure is genuinely a proportion. -->
    <div v-if="fraction !== undefined" class="mt-2.5 h-1.5 rounded-full bg-bg-elevated">
      <div
        class="h-full rounded-full transition-[width]"
        :class="BAR_TONES[tone]"
        :style="{ width: `${Math.min(100, Math.max(2, fraction * 100))}%` }"
      />
    </div>
  </AppCard>
</template>

<script setup lang="ts">
import AppCard from "./AppCard.vue";

type Tone = "neutral" | "green" | "amber" | "red";

const VALUE_TONES: Record<Tone, string> = {
  neutral: "text-text-primary",
  green: "text-accent-green",
  amber: "text-accent-amber",
  red: "text-accent-red",
};

const BAR_TONES: Record<Tone, string> = {
  neutral: "bg-accent-purple",
  green: "bg-accent-green",
  amber: "bg-accent-amber",
  red: "bg-accent-red",
};

withDefaults(
  defineProps<{ label: string; value: string; hint?: string; tone?: Tone; fraction?: number }>(),
  { tone: "neutral" },
);
</script>
