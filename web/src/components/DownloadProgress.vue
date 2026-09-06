<template>
  <div class="flex items-center gap-2">
    <div class="h-1.5 flex-1 rounded-full bg-bg-elevated">
      <!-- A sliver of bar at 0% still reads as "started", where nothing reads as broken. -->
      <div
        class="h-full rounded-full bg-accent-amber transition-[width]"
        :style="{ width: `${Math.max(2, percent)}%` }"
      />
    </div>
    <span class="shrink-0 text-xs tabular-nums text-text-muted">
      {{ percent }}%<template v-if="eta"> · {{ eta }}</template>
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{ progress: number; eta?: string }>();

const percent = computed(() => Math.round(props.progress * 100));
</script>
