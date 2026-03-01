<template>
  <div v-if="refs.length > 0" class="rule-top-strong mb-6 pt-3">
    <div
      class="font-ui mb-2 text-[0.6875rem] font-semibold tracking-widest uppercase text-text-muted"
    >
      Media Index
    </div>
    <div
      v-for="ref in refs"
      :key="`${ref.action}-${ref.title}`"
      class="flex items-baseline gap-2 py-0.5 text-sm"
    >
      <span
        :class="ref.action === 'add' ? 'text-accent-green' : 'text-accent-red'"
        class="shrink-0 font-bold"
      >
        {{ ref.action === "add" ? "+" : "\u2212" }}
      </span>
      <span>
        <a
          v-if="ref.href"
          :href="ref.href"
          target="_blank"
          rel="noopener"
          class="text-accent-blue underline decoration-dotted underline-offset-2 hover:decoration-solid"
          >{{ ref.title }}</a
        >
        <span v-else>{{ ref.title }}</span>
      </span>
      <span class="font-ui ml-auto whitespace-nowrap text-[0.8125rem] text-text-muted">
        {{ metaText(ref) }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { MediaRef } from "@shared/types";

defineProps<{ refs: MediaRef[] }>();

function metaText(ref: MediaRef): string {
  const parts = [ref.mediaType];
  if (ref.username) parts.push(`@${ref.username}`);
  return parts.join(" \u00B7 ");
}
</script>
