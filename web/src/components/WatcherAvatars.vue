<template>
  <HoverCardRoot v-if="watchers.length" :open-delay="120" :close-delay="80">
    <HoverCardTrigger
      as="div"
      tabindex="0"
      :aria-label="summary"
      class="stack flex cursor-pointer items-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-purple"
    >
      <WatcherAvatar v-for="watcher in shown" :key="watcher.name" :watcher="watcher" />

      <span
        v-if="overflow > 0"
        class="flex size-6 shrink-0 items-center justify-center rounded-full bg-bg-input text-[10px] font-semibold text-text-muted"
        >+{{ overflow }}</span
      >
    </HoverCardTrigger>

    <HoverCardPortal>
      <HoverCardContent
        side="top"
        align="end"
        :side-offset="6"
        class="z-30 w-[min(15rem,calc(100vw-2rem))] rounded-card border border-border-primary bg-bg-surface p-2 shadow-raised"
      >
        <ul class="space-y-1.5">
          <li v-for="watcher in watchers" :key="watcher.name" class="flex items-center gap-2">
            <WatcherAvatar :watcher="watcher" />
            <span class="min-w-0 flex-1 truncate text-xs text-text-primary">
              {{ watcher.name }}
            </span>
            <span v-if="watcher.watchedAt" class="shrink-0 text-xs text-text-muted">
              {{ relativeTime(watcher.watchedAt) }}
            </span>
          </li>
        </ul>
      </HoverCardContent>
    </HoverCardPortal>
  </HoverCardRoot>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { HoverCardContent, HoverCardPortal, HoverCardRoot, HoverCardTrigger } from "reka-ui";
import type { Watcher } from "#shared/types";
import { formatNames } from "#web/utils/format";
import { relativeTime } from "#web/composables/useRelativeTime";
import WatcherAvatar from "./WatcherAvatar.vue";

const props = withDefaults(defineProps<{ watchers: Watcher[]; max?: number; verb?: string }>(), {
  max: 4,
  verb: "watched this",
});

const shown = computed(() => props.watchers.slice(0, props.max));
const overflow = computed(() => props.watchers.length - shown.value.length);

/** "Bob, Jane and Sue have watched this". */
const summary = computed(() => {
  const names = props.watchers.map((watcher) => watcher.name);
  return `${formatNames(names)} ${names.length === 1 ? "has" : "have"} ${props.verb}`;
});
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
