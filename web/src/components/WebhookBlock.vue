<template>
  <div
    :id="notification.id"
    class="webhook-block message-block fade-in relative mb-4 border-l-2 border-accent-amber pl-3 scroll-mt-4"
  >
    <div class="flex items-center gap-2 text-sm">
      <svg
        class="size-3.5 shrink-0 text-accent-amber"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      <span class="text-text-muted">{{ sourceName }}</span>
      <span class="font-medium text-text-secondary">
        {{ notification.payload.title }}
      </span>
      <span v-if="qualityBadge" class="rounded bg-bg-elevated px-1.5 py-px text-xs text-text-muted">
        {{ qualityBadge }}
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

const qualityBadge = computed(() => {
  const p = props.notification.payload;
  if (!p.quality) return "";
  return p.releaseGroup ? `${p.quality} · ${p.releaseGroup}` : p.quality;
});
</script>

<style scoped>
.webhook-block code {
  font-size: 0.6875rem;
  letter-spacing: 0.02em;
}
</style>
