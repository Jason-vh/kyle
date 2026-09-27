<template>
  <AppCard interactive class="relative">
    <div class="flex gap-3">
      <MediaPoster :path="item.posterPath" :alt="item.title" size="lg" />

      <div class="flex min-w-0 flex-1 flex-col">
        <MediaTitle
          :media-type="item.mediaType"
          :tmdb-id="item.tmdbId"
          :title="item.title"
          :year="item.year"
          :poster-path="item.posterPath"
        />

        <p class="mt-0.5 text-xs text-text-muted">
          {{ item.mediaType === "movie" ? "Movie" : "Series" }}
        </p>

        <p v-if="item.overview" class="mt-1 line-clamp-2 text-xs text-text-muted">
          {{ item.overview }}
        </p>

        <p v-if="item.requestedBy.length" class="mt-1 truncate text-xs text-text-muted">
          Requested by {{ namesOf(item.requestedBy) }}
        </p>

        <div class="mt-auto flex items-center gap-2 pt-2">
          <StatusPill v-if="item.libraryStatus === 'available'" tone="green">Available</StatusPill>
          <StatusPill v-else-if="item.libraryStatus === 'pending'" tone="amber">
            Downloading
          </StatusPill>

          <StatusPill v-if="item.libraryStatus === 'unknown'">Library unavailable</StatusPill>
          <RequestAction
            v-else
            :item="item"
            :held="item.libraryStatus !== undefined"
            size="sm"
            class="relative ml-auto"
          />
        </div>
      </div>
    </div>
  </AppCard>
</template>

<script setup lang="ts">
import type { DiscoverResult } from "#web/api/requests";
import { namesOf } from "#web/utils/people";
import MediaTitle from "./MediaTitle.vue";
import RequestAction from "./RequestAction.vue";
import AppCard from "./ui/AppCard.vue";
import MediaPoster from "./ui/MediaPoster.vue";
import StatusPill from "./ui/StatusPill.vue";

defineProps<{ item: DiscoverResult }>();
</script>
