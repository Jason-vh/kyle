<template>
  <!-- Multi-episode: expandable -->
  <details
    v-if="episodes.length > 1"
    :id="notification.id"
    class="webhook-block message-block fade-in relative mb-4 cursor-pointer border-l-2 border-accent-green pl-3 scroll-mt-4"
  >
    <summary class="flex items-center gap-2 list-none text-sm text-text-muted">
      <DownloadIcon />
      <span>
        Downloaded {{ episodes.length }} episodes of
        <span class="font-medium text-text-secondary">{{ notification.payload.title }}</span>
      </span>
      <time :datetime="notification.receivedAt" class="ml-auto shrink-0 whitespace-nowrap text-xs">
        {{ formattedTime }}
      </time>
    </summary>
    <div class="mt-1 space-y-px pl-5.5">
      <div
        v-for="(ep, i) in episodes"
        :key="i"
        class="flex items-baseline gap-2 text-xs text-text-muted"
      >
        <code class="shrink-0 font-mono text-text-secondary">{{ ep.code }}</code>
        <span class="truncate">{{ ep.title }}</span>
      </div>
    </div>
  </details>

  <!-- Single episode or movie: inline -->
  <div
    v-else
    :id="notification.id"
    class="webhook-block message-block fade-in relative mb-4 border-l-2 border-accent-green pl-3 scroll-mt-4"
  >
    <div class="flex items-center gap-2 text-sm text-text-muted">
      <DownloadIcon />
      <span>
        Downloaded
        <span class="font-medium text-text-secondary">{{ notification.payload.title }}</span>
        <template v-if="episodes.length === 1">
          {{ episodes[0]!.code }} "{{ episodes[0]!.title }}"
        </template>
      </span>
      <time :datetime="notification.receivedAt" class="ml-auto shrink-0 whitespace-nowrap text-xs">
        {{ formattedTime }}
      </time>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { relativeTime } from "../composables/useRelativeTime";
import type { ThreadWebhook } from "@shared/types";
import DownloadIcon from "./DownloadIcon.vue";

const props = defineProps<{ notification: ThreadWebhook }>();

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
.webhook-block summary::-webkit-details-marker {
  display: none;
}
.webhook-block code {
  font-size: 0.6875rem;
  letter-spacing: 0.02em;
}
</style>
