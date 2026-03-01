<template>
  <div
    :id="notification.id"
    class="webhook-block message-block fade-in relative mb-4 rounded-lg border border-border-primary bg-bg-surface p-4 scroll-mt-4"
  >
    <div class="mb-2 flex items-center gap-2">
      <UserAvatar :name="sourceName" />
      <span class="text-sm font-semibold text-text-primary">{{ sourceName }}</span>
      <time
        :datetime="notification.receivedAt"
        class="ml-auto whitespace-nowrap text-xs text-text-muted"
      >
        {{ formattedTime }}
      </time>
    </div>

    <!-- Multi-episode: expandable -->
    <details v-if="episodes.length > 1" class="cursor-pointer">
      <summary class="list-none text-sm text-text-secondary">
        Downloaded {{ episodes.length }} episodes of
        <span class="font-medium">{{ notification.payload.title }}</span>
      </summary>
      <div class="mt-1.5 space-y-px">
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

    <!-- Single episode -->
    <div v-else-if="episodes.length === 1" class="text-sm text-text-secondary">
      Downloaded
      <span class="font-medium">{{ notification.payload.title }}</span>
      {{ episodes[0]!.code }} "{{ episodes[0]!.title }}"
    </div>

    <!-- Movie (no episodes) -->
    <div v-else class="text-sm text-text-secondary">
      Downloaded
      <span class="font-medium">{{ notification.payload.title }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { relativeTime } from "../composables/useRelativeTime";
import type { ThreadWebhook } from "@shared/types";
import UserAvatar from "./UserAvatar.vue";

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
.webhook-block summary::-webkit-details-marker {
  display: none;
}
.webhook-block code {
  font-size: 0.6875rem;
  letter-spacing: 0.02em;
}
</style>
