<template>
  <h3 class="flex min-w-0 items-baseline gap-1.5 text-sm font-semibold text-text-primary">
    <!-- Media added before Kyle, or by hand, has no TMDB id and so no page. -->
    <!--
      The link covers its whole card through `after`, so the card is clickable
      without wrapping buttons inside an anchor. The card must be `relative`,
      and anything else clickable in it `relative` in turn.
    -->
    <RouterLink
      v-if="tmdbId"
      :to="{
        name: 'media',
        params: { mediaType, tmdbId },
        state: { preview: { mediaType, tmdbId, ...shown, posterPath } },
      }"
      class="truncate text-inherit no-underline after:absolute after:inset-0 hover:underline"
      @pointerenter="prefetch(tmdbId)"
      @focus="prefetch(tmdbId)"
      @touchstart.passive="prefetch(tmdbId)"
    >
      {{ shown.title }}
    </RouterLink>
    <span v-else class="truncate">{{ shown.title }}</span>
    <span v-if="shown.year" class="shrink-0 font-normal text-text-muted">({{ shown.year }})</span>
  </h3>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { LibraryMediaType } from "#shared/types";
import { prefetchMediaDetail } from "#web/queries/media";
import { titleAndYear } from "#web/utils/media-title";

const props = defineProps<{
  mediaType: LibraryMediaType;
  tmdbId?: number;
  title: string;
  year?: number;
  posterPath?: string | null;
}>();

const shown = computed(() => titleAndYear(props.title, props.year));

function prefetch(tmdbId: number) {
  prefetchMediaDetail(props.mediaType, tmdbId);
}
</script>
