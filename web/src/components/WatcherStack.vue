<template>
  <div
    role="img"
    :aria-label="label"
    class="stack flex items-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-purple"
  >
    <WatcherAvatar v-for="watcher in shown" :key="watcher.name" :watcher="watcher" />

    <span
      v-if="overflow > 0"
      class="flex size-6 shrink-0 items-center justify-center rounded-full bg-bg-input text-[10px] font-semibold text-text-muted"
      >+{{ overflow }}</span
    >
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { Watcher } from "#shared/types";
import WatcherAvatar from "./WatcherAvatar.vue";

const props = defineProps<{ watchers: Watcher[]; max: number; label: string }>();

const shown = computed(() => props.watchers.slice(0, props.max));
const overflow = computed(() => props.watchers.length - shown.value.length);
</script>

<style scoped>
/* Registered so the overlap can be transitioned, which a plain variable cannot. */
@property --avatar-overlap {
  syntax: "<length>";
  inherits: true;
  initial-value: 6px;
}

.stack {
  --avatar-overlap: 6px;
  transition: --avatar-overlap 150ms ease;
}

/* The faces spread on hover, to say the stack answers to it. */
.stack:hover {
  --avatar-overlap: 1px;
}

/*
 * A bite out of each face where the one before it laps over. A ring would have
 * to be drawn across that neighbour instead, which shows as an arc on it.
 */
.stack > :not(:first-child) {
  margin-inline-start: calc(var(--avatar-overlap) * -1);
  mask-image: radial-gradient(
    circle 14px at calc(var(--avatar-overlap) - 12px) 50%,
    transparent 99%,
    #000 100%
  );
}
</style>
