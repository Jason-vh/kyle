<template>
  <div
    v-if="refs.length > 0"
    class="mb-6 rounded-lg border border-border-subtle bg-bg-surface p-3 px-4"
  >
    <div class="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Media</div>
    <div
      v-for="ref in refs"
      :key="`${ref.action}-${ref.title}`"
      class="flex items-baseline gap-2 py-0.5 text-sm"
    >
      <span
        :class="ref.action === 'add' ? 'text-accent-green' : 'text-accent-red'"
        class="shrink-0 font-bold"
      >
        {{ ref.action === "add" ? "+" : "−" }}
      </span>
      <span>
        <a
          v-if="ref.href"
          :href="ref.href"
          target="_blank"
          rel="noopener"
          class="text-accent-blue hover:underline"
          >{{ ref.title }}</a
        >
        <span v-else>{{ ref.title }}</span>
      </span>
      <span class="ml-auto whitespace-nowrap text-[0.8125rem] text-text-muted">
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
  return parts.join(" · ");
}
</script>
