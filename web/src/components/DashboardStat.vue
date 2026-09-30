<template>
  <AppCard>
    <!-- Figure and caption read as one phrase: "42h watched". -->
    <p class="flex flex-wrap items-baseline gap-x-1.5 leading-tight">
      <span class="text-2xl font-semibold tabular-nums" :class="VALUE_TONES[tone]">
        {{ value }}
      </span>
      <span class="text-sm text-text-muted">{{ caption }}</span>
    </p>
    <slot />
  </AppCard>
</template>

<script setup lang="ts">
import AppCard from "#web/components/ui/AppCard.vue";

export type DashboardStatTone = "neutral" | "green" | "amber" | "red";

const VALUE_TONES: Record<DashboardStatTone, string> = {
  neutral: "text-text-primary",
  green: "text-accent-green",
  amber: "text-accent-amber",
  red: "text-accent-red",
};

withDefaults(defineProps<{ value: string; caption: string; tone?: DashboardStatTone }>(), {
  tone: "neutral",
});
</script>
