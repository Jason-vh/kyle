<template>
  <AppCard :interactive="!!item.tmdbId" class="relative">
    <div class="flex items-center gap-3">
      <MediaPoster :src="item.posterUrl" :alt="item.title" size="sm" />

      <div class="min-w-0 flex-1">
        <div class="flex items-baseline gap-2">
          <MediaTitle :media-type="item.mediaType" :tmdb-id="item.tmdbId" :title="item.title" />
          <span v-if="item.year" class="shrink-0 text-xs text-text-muted">{{ item.year }}</span>
        </div>
        <p v-if="item.detail" class="truncate text-xs text-text-muted">{{ item.detail }}</p>
        <p class="mt-0.5 truncate text-xs text-text-muted">
          {{ relativeTime(item.at) }}
          <template v-if="item.requestedBy.length">
            · for {{ item.requestedByMe ? "you" : formatNames(item.requestedBy) }}
          </template>
        </p>
      </div>

      <StatusPill v-if="item.requestedByMe" tone="purple">Yours</StatusPill>
    </div>
  </AppCard>
</template>

<script setup lang="ts">
import type { ActivityItem } from "#web/api/dashboard";
import { relativeTime } from "#web/composables/useRelativeTime";
import { formatNames } from "#web/utils/format";
import MediaTitle from "./MediaTitle.vue";
import AppCard from "./ui/AppCard.vue";
import MediaPoster from "./ui/MediaPoster.vue";
import StatusPill from "./ui/StatusPill.vue";

defineProps<{ item: ActivityItem }>();
</script>
