<template>
  <div
    :id="notification.id"
    class="message-block flex gap-3 rounded-lg border-l-3 p-3.5 mb-2 relative scroll-mt-4"
    style="
      background: color-mix(in srgb, var(--color-accent-amber) 6%, var(--color-bg-surface));
      border-left-color: var(--color-accent-amber);
    "
  >
    <!-- Bell icon -->
    <div
      class="flex size-8 shrink-0 items-center justify-center rounded-full"
      style="
        background: color-mix(in srgb, var(--color-accent-amber) 20%, var(--color-bg-elevated));
      "
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="text-accent-amber"
      >
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    </div>
    <div class="min-w-0 flex-1">
      <div class="mb-1 flex items-center gap-2">
        <span
          class="rounded border px-1.5 py-0.5 text-[0.6875rem] font-bold uppercase tracking-wide text-accent-amber"
          style="
            background: color-mix(in srgb, var(--color-accent-amber) 15%, var(--color-bg-elevated));
            border-color: color-mix(in srgb, var(--color-accent-amber) 25%, transparent);
          "
        >
          {{ sourceName }}
        </span>
        <time :datetime="notification.receivedAt" class="ml-auto text-xs text-text-muted">
          {{ formattedTime }}
        </time>
      </div>
      <div class="font-semibold text-[0.9375rem]">
        {{ notification.payload.title
        }}{{ notification.payload.year ? ` (${notification.payload.year})` : "" }}
      </div>
      <div v-if="detail" class="mt-1 whitespace-pre-wrap text-[0.8125rem] text-text-secondary">
        {{ detail }}
      </div>
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
    parts.push(`${p.quality}${p.releaseGroup ? ` · ${p.releaseGroup}` : ""}`);
  }
  return parts.join("\n");
});
</script>
