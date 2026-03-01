<template>
  <div
    :id="notification.id"
    class="webhook-block message-block fade-in relative mb-4 border-l-2 border-accent-green pl-3 scroll-mt-4"
  >
    <div class="flex items-center gap-2 text-sm">
      <svg
        class="size-3.5 shrink-0 text-accent-green"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
      <span class="text-text-muted">{{ sourceName }} · Downloaded</span>
      <span class="font-medium text-text-secondary">
        {{ notification.payload.title }}
      </span>

      <time
        :datetime="notification.receivedAt"
        class="ml-auto shrink-0 whitespace-nowrap text-xs text-text-muted"
      >
        {{ formattedTime }}
      </time>
    </div>
    <div v-if="episodes.length > 0" class="mt-0.5 space-y-px pl-5.5">
      <div
        v-for="(ep, i) in episodes"
        :key="i"
        class="flex items-baseline gap-2 text-xs text-text-muted"
      >
        <code class="shrink-0 font-mono text-text-secondary">{{ ep.code }}</code>
        <span class="truncate">{{ ep.title }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { relativeTime } from "../composables/useRelativeTime";
import type { ThreadWebhook } from "@shared/types";

const props = defineProps<{ notification: ThreadWebhook }>();

const sourceName = computed(
  () => props.notification.source.charAt(0).toUpperCase() + props.notification.source.slice(1),
);

const formattedTime = computed(() => relativeTime(props.notification.receivedAt));

const episodes = computed(() => {
  const p = props.notification.payload;
  if (!p.episodes || p.episodes.length === 0) return [];
  return p.episodes.map((e) => ({
    code: `S${String(e.seasonNumber).padStart(2, "0")}E${String(e.episodeNumber).padStart(2, "0")}`,
    title: e.title,
  }));
});
</script>

<style scoped>
.webhook-block code {
  font-size: 0.6875rem;
  letter-spacing: 0.02em;
}
</style>
