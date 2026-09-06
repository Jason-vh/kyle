<template>
  <h3 class="truncate text-sm font-semibold text-text-primary">
    <!-- Media added before Kyle, or by hand, has no TMDB id and so no page. -->
    <RouterLink
      v-if="tmdbId"
      :to="{ name: 'media', params: { mediaType, tmdbId } }"
      class="text-inherit no-underline hover:underline"
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
