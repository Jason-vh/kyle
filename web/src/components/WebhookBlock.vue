<template>
  <div
    :id="notification.id"
    class="message-block fade-in relative mb-4 border-l-2 border-accent-amber pl-3 scroll-mt-4"
  >
    <div class="flex items-center gap-2 text-sm text-text-muted">
      <svg
        class="size-3.5 shrink-0 text-accent-amber"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      <span class="min-w-0 truncate">
        {{ sourceName }} · {{ notification.payload.title
        }}{{ notification.payload.year ? ` (${notification.payload.year})` : "" }}
      </span>
      <time
        :datetime="notification.receivedAt"
        class="ml-auto shrink-0 whitespace-nowrap text-xs text-text-muted"
      >
        {{ formattedTime }}
      </time>
    </div>
    <div v-if="episodes.length > 0" class="mt-0.5 space-y-px pl-5.5 text-sm text-text-muted">
      <div v-for="(ep, i) in episodes" :key="i">{{ ep }}</div>
    </div>
    <div v-if="qualityLine" class="mt-0.5 pl-5.5 text-xs text-text-muted">
      {{ qualityLine }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { relativeTime } from "../composables/useRelativeTime";
import type { ThreadWebhook } from "@shared/types";

const props = defineProps<{ notification: ThreadWebhook }>();

const sourceName = computed(() => (props.notification.source === "sonarr" ? "Sonarr" : "Radarr"));

const formattedTime = computed(() => relativeTime(props.notification.receivedAt));

const episodes = computed(() => {
  const p = props.notification.payload;
  if (!p.episodes || p.episodes.length === 0) return [];
  return p.episodes.map(
    (e) =>
      `S${String(e.seasonNumber).padStart(2, "0")}E${String(e.episodeNumber).padStart(2, "0")} "${e.title}"`,
  );
});

const qualityLine = computed(() => {
  const p = props.notification.payload;
  if (!p.quality) return "";
  return `${p.quality}${p.releaseGroup ? ` \u00B7 ${p.releaseGroup}` : ""}`;
});
</script>
