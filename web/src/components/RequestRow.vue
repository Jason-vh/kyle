<template>
  <AppCard interactive class="relative">
    <div class="flex items-center gap-3">
      <MediaPoster :src="posterUrl(request.posterPath)" :alt="request.title" />

      <div class="min-w-0 flex-1">
        <div class="flex items-baseline gap-2">
          <MediaTitle
            :media-type="request.mediaType"
            :tmdb-id="request.tmdbId"
            :title="request.title"
          />
          <span v-if="request.year" class="shrink-0 text-xs text-text-muted">
            {{ request.year }}
          </span>
        </div>

        <p class="mt-0.5 truncate text-xs text-text-muted">
          {{ request.mediaType === "movie" ? "Movie" : "Series" }}
          <template v-if="request.requestedBy"> · {{ request.requestedBy }}</template>
          · {{ relativeTime(request.createdAt) }}
        </p>

        <DownloadProgress
          v-if="request.progress !== undefined"
          :progress="request.progress"
          :eta="request.eta"
          class="mt-1.5"
        />
      </div>

      <StatusPill :tone="STATES[request.state].tone">{{ STATES[request.state].label }}</StatusPill>
    </div>
  </AppCard>
</template>

<script setup lang="ts">
import type { MediaRequest, RequestState } from "#web/api/requests";
import { posterUrl } from "#web/utils/images";
import { relativeTime } from "#web/composables/useRelativeTime";
import DownloadProgress from "./DownloadProgress.vue";
import MediaTitle from "./MediaTitle.vue";
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
