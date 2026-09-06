<template>
  <h3 class="truncate text-sm font-semibold text-text-primary">
    <!-- Media added before Kyle, or by hand, has no TMDB id and so no page. -->
    <!--
      The link covers its whole card through `after`, so the card is clickable
      without wrapping buttons inside an anchor. The card must be `relative`,
      and anything else clickable in it `relative` in turn.
    -->
    <RouterLink
      v-if="tmdbId"
      :to="{ name: 'media', params: { mediaType, tmdbId } }"
      class="text-inherit no-underline after:absolute after:inset-0 hover:underline"
    >
      {{ title }}
    </RouterLink>
    <template v-else>{{ title }}</template>
  </h3>
</template>

<script setup lang="ts">
import type { LibraryMediaType } from "#shared/types";

defineProps<{ mediaType: LibraryMediaType; tmdbId?: number; title: string }>();
</script>
