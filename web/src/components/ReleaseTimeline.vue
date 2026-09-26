<template>
  <ol class="grid grid-cols-3">
    <li
      v-for="(step, index) in steps"
      :key="step.label"
      class="relative pt-5 text-xs"
      :aria-current="index === current ? 'step' : undefined"
    >
      <span
        class="absolute top-[5px] h-0.5"
        :class="[
          index === steps.length - 1 ? 'right-auto w-1.5' : 'right-0',
          index === 0 ? 'left-1.5' : 'left-0',
          index < current ? 'bg-text-secondary' : 'bg-border-secondary',
        ]"
        aria-hidden="true"
      />
      <span
        class="absolute top-0 left-0 size-3 rounded-full border-2"
        :class="dotClass(index)"
        aria-hidden="true"
      />
      <span
        class="block font-medium"
        :class="index <= current ? 'text-text-primary' : 'text-text-muted'"
      >
        {{ step.label }}
      </span>
      <span class="text-text-muted">{{ step.date ? formatDate(step.date) : step.fallback }}</span>
    </li>
  </ol>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { MovieReleases } from "#shared/types";
import { formatDate } from "#web/utils/format";

const props = defineProps<{ releases: MovieReleases }>();

interface Step {
  label: string;
  date?: string;
  /** What stands in for a date nobody has announced. */
  fallback: string;
}

/** A disc is as good as a stream to fetch from, so whichever comes first is the next step. */
function homeRelease(releases: MovieReleases): Step {
  if (releases.digital || !releases.physical) {
    return { label: "Streaming", date: releases.digital, fallback: "TBA" };
  }
  return { label: "On disc", date: releases.physical, fallback: "TBA" };
}

const steps = computed<Step[]>(() => [
  { label: "Cinemas", date: props.releases.cinema, fallback: "TBA" },
  homeRelease(props.releases),
  { label: "On Plex", fallback: "\u00a0" },
]);

/** The last step already reached; -1 while not even the cinemas have it. */
const current = computed(() => {
  const now = Date.now();
  return steps.value.findLastIndex((step) => !!step.date && Date.parse(step.date) <= now);
});

function dotClass(index: number): string {
  if (index < current.value) return "border-text-secondary bg-text-secondary";
  if (index === current.value)
    return "border-text-primary bg-bg-surface ring-4 ring-text-primary/10";
  return "border-border-secondary bg-bg-surface";
}
</script>
