<template>
  <div
    v-if="refs.length > 0"
    class="mb-6 rounded-lg border border-border-primary bg-bg-surface p-4"
  >
    <div class="mb-2 text-xs font-medium text-text-muted">Media Actions</div>
    <div
      v-for="ref in refs"
      :key="`${ref.action}-${ref.title}`"
      class="flex items-center gap-2 py-0.5 text-sm"
    >
      <span
        class="flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-text-inverse"
        :class="ref.action === 'add' ? 'bg-accent-green' : 'bg-accent-red'"
      >
        {{ ref.action === "add" ? "+" : "\u2212" }}
      </span>
      <span>
        <a
          v-if="ref.href"
          :href="ref.href"
          target="_blank"
          rel="noopener"
          class="text-accent-blue underline decoration-accent-blue/40 underline-offset-2 hover:decoration-accent-blue"
          >{{ ref.title }}</a
        >
        <span v-else>{{ ref.title }}</span>
      </span>
      <span class="ml-auto whitespace-nowrap text-xs text-text-muted">
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
