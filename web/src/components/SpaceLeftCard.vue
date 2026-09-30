<template>
  <DashboardStat
    :value="formatSize(storage.freeBytes)"
    :caption="`left of ${formatSize(storage.totalBytes)}`"
    :tone="tone"
  >
    <!-- The used part of the disk, with the viewer's own share of it picked out. -->
    <div
      role="img"
      :aria-label="summary"
      class="mt-2.5 flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-bg-elevated"
    >
      <span v-if="viewerBytes" :class="BAR_TONES[tone]" :style="{ width: share(viewerBytes) }" />
      <span :class="OTHERS_TONES[tone]" :style="{ width: share(othersBytes) }" />
    </div>

    <p
      v-if="viewerBytes"
      class="mt-1.5 flex items-center gap-1.5 text-xs text-text-muted tabular-nums"
    >
      <span class="size-1.5 rounded-full" :class="BAR_TONES[tone]" />
      Your media
      <span class="font-semibold text-text-secondary">{{ formatSize(viewerBytes) }}</span>
    </p>
  </DashboardStat>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { StorageStat } from "#shared/types";
import { formatSize } from "#web/utils/format";
import DashboardStat, { type DashboardStatTone } from "./DashboardStat.vue";

const BAR_TONES: Record<DashboardStatTone, string> = {
  neutral: "bg-accent",
  green: "bg-accent-green",
  amber: "bg-accent-amber",
  red: "bg-accent-red",
};

const OTHERS_TONES: Record<DashboardStatTone, string> = {
  neutral: "bg-accent/40",
  green: "bg-accent-green/40",
  amber: "bg-accent-amber/40",
  red: "bg-accent-red/40",
};

const props = defineProps<{ storage: StorageStat }>();

const usedBytes = computed(() => Math.max(0, props.storage.totalBytes - props.storage.freeBytes));
const viewerBytes = computed(() => Math.min(props.storage.viewerBytes ?? 0, usedBytes.value));
const othersBytes = computed(() => usedBytes.value - viewerBytes.value);

/** A disk close to full turns the figure, and the bar, amber and then red. */
const tone = computed<DashboardStatTone>(() => {
  if (!props.storage.totalBytes) return "neutral";
  const used = usedBytes.value / props.storage.totalBytes;
  if (used >= 0.95) return "red";
  if (used >= 0.85) return "amber";
  return "green";
});

const summary = computed(() => {
  const parts = [
    `${formatSize(props.storage.freeBytes)} left of ${formatSize(props.storage.totalBytes)}`,
  ];
  if (viewerBytes.value) parts.push(`your media takes ${formatSize(viewerBytes.value)}`);
  return parts.join(", ");
});

function share(bytes: number): string {
  if (!props.storage.totalBytes) return "0%";
  return `${(bytes / props.storage.totalBytes) * 100}%`;
}
</script>
