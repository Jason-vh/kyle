<template>
  <AppCard>
    <p class="text-xs font-semibold tracking-wide text-text-muted uppercase">{{ label }}</p>
    <p class="mt-1.5 text-2xl leading-tight font-semibold" :class="VALUE_TONES[tone]">
      {{ value }}
    </p>
    <p v-if="hint" class="mt-0.5 truncate text-xs text-text-muted">{{ hint }}</p>

    <!-- A bar only appears where a figure is genuinely a proportion. -->
    <ProgressRoot
      v-if="percent !== undefined"
      :model-value="percent"
      :aria-label="label"
      class="mt-2.5 h-1.5 overflow-hidden rounded-full bg-bg-elevated"
    >
      <ProgressIndicator
        class="h-full rounded-full transition-[width]"
        :class="BAR_TONES[tone]"
        :style="{ width: `${Math.max(2, percent)}%` }"
      />
    </ProgressRoot>
  </AppCard>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { ProgressIndicator, ProgressRoot } from "reka-ui";
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

const props = withDefaults(
  defineProps<{ label: string; value: string; hint?: string; tone?: Tone; fraction?: number }>(),
  { tone: "neutral" },
);

const percent = computed(() => {
  if (props.fraction === undefined) return undefined;
  return Math.round(Math.min(1, Math.max(0, props.fraction)) * 100);
});
</script>
