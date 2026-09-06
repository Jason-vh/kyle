<template>
  <AppCard>
    <div class="flex items-center gap-3">
      <MediaPoster :src="posterUrl(request.posterPath)" :alt="request.title" />

      <div class="min-w-0 flex-1">
        <div class="flex items-baseline gap-2">
          <h3 class="truncate text-sm font-semibold text-text-primary">{{ request.title }}</h3>
          <span v-if="request.year" class="shrink-0 text-xs text-text-muted">
            {{ request.year }}
          </span>
        </div>

        <p class="mt-0.5 truncate text-xs text-text-muted">
          {{ request.mediaType === "movie" ? "Movie" : "Series" }}
          <template v-if="request.requestedBy"> · {{ request.requestedBy }}</template>
          · {{ relativeTime(request.createdAt) }}
        </p>

        <div v-if="request.progress !== undefined" class="mt-1.5 flex items-center gap-2">
          <div class="h-1.5 flex-1 rounded-full bg-bg-elevated">
            <div
              class="h-full rounded-full bg-accent-amber transition-[width]"
              :style="{ width: `${Math.max(2, Math.round(request.progress * 100))}%` }"
            />
          </div>
          <span class="shrink-0 text-xs tabular-nums text-text-muted">
            {{ Math.round(request.progress * 100) }}%<template v-if="request.eta">
              · {{ request.eta }}</template
            >
          </span>
        </div>
      </div>

      <StatusPill :tone="STATES[request.state].tone">{{ STATES[request.state].label }}</StatusPill>
    </div>
  </AppCard>
</template>

<script setup lang="ts">
import { posterUrl, type MediaRequest, type RequestState } from "../api/requests";
import { relativeTime } from "../composables/useRelativeTime";
import AppCard from "./ui/AppCard.vue";
import MediaPoster from "./ui/MediaPoster.vue";
import StatusPill from "./ui/StatusPill.vue";
import type { Tone } from "./ui/types";

/** The one place a request's state is put into words. */
const STATES: Record<RequestState, { label: string; tone: Tone }> = {
  available: { label: "Ready", tone: "green" },
  downloading: { label: "Downloading", tone: "amber" },
  pending: { label: "Looking", tone: "blue" },
  unavailable: { label: "Gone", tone: "neutral" },
};

defineProps<{ request: MediaRequest }>();
</script>
