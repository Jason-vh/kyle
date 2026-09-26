<template>
  <div role="img" :aria-label="summary">
    <div class="flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-bg-elevated">
      <span class="bg-accent-purple" :style="{ width: share(movieBytes) }" />
      <span class="bg-accent-purple/45" :style="{ width: share(seriesBytes) }" />
      <span class="bg-border-secondary" :style="{ width: share(otherBytes) }" />
    </div>
    <div
      class="mt-1.5 flex items-center justify-between gap-3 text-xs text-text-muted tabular-nums"
    >
      <span class="flex items-center gap-3">
        <span class="flex items-center gap-1.5">
          <span class="size-1.5 rounded-full bg-accent-purple" />
          Movies {{ formatSize(movieBytes) }}
        </span>
        <span class="flex items-center gap-1.5">
          <span class="size-1.5 rounded-full bg-accent-purple/45" />
          Series {{ formatSize(seriesBytes) }}
        </span>
      </span>
      <span>
        <span class="font-semibold text-text-secondary">{{ formatSize(storage.freeBytes) }}</span>
        free
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { StorageStat } from "#shared/types";
import { formatSize } from "#web/utils/format";

const props = defineProps<{ storage: StorageStat; movieBytes: number; seriesBytes: number }>();

const usedBytes = computed(() => props.storage.totalBytes - props.storage.freeBytes);
const otherBytes = computed(() =>
  Math.max(0, usedBytes.value - props.movieBytes - props.seriesBytes),
);

const summary = computed(
  () =>
    `${formatSize(usedBytes.value)} of ${formatSize(props.storage.totalBytes)} used: ` +
    `movies ${formatSize(props.movieBytes)}, series ${formatSize(props.seriesBytes)}, ` +
    `${formatSize(props.storage.freeBytes)} free`,
);

function share(bytes: number): string {
  return `${(bytes / props.storage.totalBytes) * 100}%`;
}
</script>
