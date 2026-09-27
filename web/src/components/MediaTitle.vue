<template>
  <h3
    class="text-sm font-semibold text-text-primary"
    :class="wrap ? 'line-clamp-2 leading-snug' : 'truncate'"
  >
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
        state: { preview: { mediaType, tmdbId, title, year, posterPath } },
      }"
      class="text-inherit no-underline after:absolute after:inset-0 hover:underline"
      @pointerenter="prefetch(tmdbId)"
      @focus="prefetch(tmdbId)"
      @touchstart.passive="prefetch(tmdbId)"
    >
      {{ title }}
    </RouterLink>
    <template v-else>{{ title }}</template>
  </h3>
</template>

<script setup lang="ts">
import type { LibraryMediaType } from "#shared/types";
import { prefetchMediaDetail } from "#web/queries/media";

const props = defineProps<{
  mediaType: LibraryMediaType;
  tmdbId?: number;
  title: string;
  year?: number;
  posterPath?: string | null;
  wrap?: boolean;
}>();

function prefetch(tmdbId: number) {
  prefetchMediaDetail(props.mediaType, tmdbId);
}
</script>
