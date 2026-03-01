<template>
  <div
    :id="notification.id"
    class="message-block fade-in relative mb-4 rounded-lg bg-accent-amber-light p-4 scroll-mt-4"
  >
    <div class="mb-2 flex items-center gap-2">
      <span
        class="flex size-6 items-center justify-center rounded-full bg-accent-amber text-xs text-text-inverse"
      >
        <svg
          width="14"
          height="14"
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
      </span>
      <span
        class="text-sm font-semibold"
        :class="notification.source === 'sonarr' ? 'text-accent-cyan' : 'text-accent-amber'"
      >
        {{ sourceName }}
      </span>
      <time :datetime="notification.receivedAt" class="ml-auto text-xs text-text-muted">
        {{ formattedTime }}
      </time>
    </div>
    <div class="text-base font-semibold text-text-primary">
      {{ notification.payload.title
      }}{{ notification.payload.year ? ` (${notification.payload.year})` : "" }}
    </div>
    <div v-if="detail" class="mt-1 whitespace-pre-wrap text-sm text-text-secondary">
      {{ detail }}
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

const detail = computed(() => {
  const p = props.notification.payload;
  const parts: string[] = [];
  if (p.episodes && p.episodes.length > 0) {
    const epList = p.episodes
      .map(
        (e) =>
          `S${String(e.seasonNumber).padStart(2, "0")}E${String(e.episodeNumber).padStart(2, "0")} "${e.title}"`,
      )
      .join(", ");
    parts.push(epList);
  }
  if (p.quality) {
    parts.push(`${p.quality}${p.releaseGroup ? ` \u00B7 ${p.releaseGroup}` : ""}`);
  }
  return parts.join("\n");
});
</script>
