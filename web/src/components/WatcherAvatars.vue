<template>
  <div v-if="watchers.length" class="flex items-center" :title="tooltip">
    <div
      v-for="(watcher, i) in shown"
      :key="watcher.name"
      class="-ml-1.5 size-6 shrink-0 overflow-hidden rounded-full ring-2 ring-bg-surface first:ml-0"
      :style="{ zIndex: shown.length - i }"
    >
      <img
        v-if="watcher.thumb"
        :src="watcher.thumb"
        :alt="watcher.name"
        loading="lazy"
        class="size-full object-cover"
      />
      <div
        v-else
        class="flex size-full items-center justify-center bg-accent-purple text-[10px] font-semibold text-text-inverse"
      >
        {{ initial(watcher.name) }}
      </div>
    </div>

    <span
      v-if="overflow > 0"
      class="-ml-1.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-bg-input text-[10px] font-semibold text-text-muted ring-2 ring-bg-surface"
    >
      +{{ overflow }}
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { Watcher } from "@shared/types";

const props = withDefaults(defineProps<{ watchers: Watcher[]; max?: number }>(), { max: 4 });

const shown = computed(() => props.watchers.slice(0, props.max));
const overflow = computed(() => props.watchers.length - shown.value.length);

function initial(name: string): string {
  const first = String.fromCodePoint(name.codePointAt(0) ?? 63);
  return /\p{L}/u.test(first) ? first.toUpperCase() : "?";
}

/** "Bob, Jane and Sue have watched this". */
const tooltip = computed(() => {
  const names = props.watchers.map((w) => w.name);
  const list =
    names.length <= 1
      ? (names[0] ?? "")
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${list} ${names.length === 1 ? "has" : "have"} watched this`;
});
</script>
