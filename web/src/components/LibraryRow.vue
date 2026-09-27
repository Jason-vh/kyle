<template>
  <li
    class="group relative flex min-h-21 items-center gap-3 px-3 py-2.5 transition-colors not-first:before:absolute not-first:before:top-0 not-first:before:right-0 not-first:before:left-17 not-first:before:border-t not-first:before:border-border-primary first:rounded-t-card last:rounded-b-card"
    :class="{ 'hover:bg-bg-elevated': item.tmdbId }"
  >
    <LibraryPoster :src="item.posterUrl" :dimmed="missing" />

    <div class="flex min-w-0 flex-1 flex-col gap-0.5">
      <MediaTitle
        :media-type="item.mediaType"
        :tmdb-id="item.tmdbId"
        :title="item.title"
        :class="{ 'text-text-secondary!': missing }"
      />
      <p class="truncate text-xs whitespace-nowrap text-text-muted tabular-nums">
        {{ details.join(" · ") }}
      </p>
      <div v-if="statuses.length" class="mt-1 flex flex-wrap gap-1">
        <StatusPill v-for="status in statuses" :key="status.label" :tone="status.tone">
          <template v-if="status.downloading">
            <IconDownload class="size-3.5" aria-hidden="true" />
            <span class="sr-only">Downloading</span>
          </template>
          {{ status.label }}
        </StatusPill>
      </div>
    </div>

    <div class="relative shrink-0 self-start pt-0.5">
      <WatcherAvatars :watchers="item.requestedBy" :max="2" verb="requested this" />
    </div>
  </li>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { LibraryItem } from "#web/api/library";
import { libraryDetails, libraryStatuses, type LibrarySort } from "#web/utils/library";
import LibraryPoster from "./LibraryPoster.vue";
import MediaTitle from "./MediaTitle.vue";
import WatcherAvatars from "./WatcherAvatars.vue";
import StatusPill from "./ui/StatusPill.vue";
import IconDownload from "~icons/ph/download-simple-bold";

const props = defineProps<{ item: LibraryItem; sort: LibrarySort }>();

const missing = computed(() => props.item.availability === "missing" && !props.item.download);
const details = computed(() => libraryDetails(props.item, props.sort));
const statuses = computed(() => libraryStatuses(props.item));
</script>
