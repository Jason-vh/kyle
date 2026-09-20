<template>
  <div class="size-6 shrink-0 overflow-hidden rounded-full">
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
</template>

<script setup lang="ts">
import type { Watcher } from "#shared/types";

defineProps<{ watcher: Watcher }>();

function initial(name: string): string {
  const first = String.fromCodePoint(name.codePointAt(0) ?? 63);
  return /\p{L}/u.test(first) ? first.toUpperCase() : "?";
}
</script>
