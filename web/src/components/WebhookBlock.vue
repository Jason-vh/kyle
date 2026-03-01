<template>
  <div
    :id="notification.id"
    class="message-block fade-in rule-top rule-bottom relative mb-4 py-3 scroll-mt-4"
    style="border-color: var(--color-border-rule-light)"
  >
    <div class="mb-1 flex items-center gap-2">
      <span
        class="font-ui border border-accent-amber px-1.5 py-0.5 text-[0.6875rem] font-bold tracking-widest uppercase text-accent-amber"
      >
        Bulletin
      </span>
      <span class="font-ui text-[0.6875rem] uppercase tracking-wide text-text-muted">
        {{ sourceName }}
      </span>
      <time :datetime="notification.receivedAt" class="font-ui ml-auto text-xs text-text-muted">
        {{ formattedTime }}
      </time>
    </div>
    <div class="font-serif text-lg font-semibold">
      {{ notification.payload.title
      }}{{ notification.payload.year ? ` (${notification.payload.year})` : "" }}
    </div>
    <div v-if="detail" class="mt-1 whitespace-pre-wrap text-[0.8125rem] text-text-secondary">
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
