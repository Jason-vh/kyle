<template>
  <AppPage>
    <PageHeader title="Request media" subtitle="Search for a movie or series and add it." />

    <AppInput v-model="query" placeholder="Search for a movie or series…" class="mb-5" autofocus />

    <p v-if="!term" class="py-12 text-center text-sm text-text-muted">
      Start typing to find something.
    </p>
    <QueryState
      v-else
      :loading="isPending"
      :error="error"
      :empty="results.length === 0"
      loading-text="Searching…"
      :empty-text="`Nothing found for “${term}”.`"
    >
      <div class="flex flex-col gap-2">
        <MediaCard v-for="item in results" :key="`${item.mediaType}-${item.tmdbId}`" :item="item" />
      </div>
    </QueryState>
  </AppPage>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { refDebounced, useTitle } from "@vueuse/core";
import MediaCard from "#web/components/MediaCard.vue";
import AppInput from "#web/components/ui/AppInput.vue";
import AppPage from "#web/components/ui/AppPage.vue";
import PageHeader from "#web/components/ui/PageHeader.vue";
import QueryState from "#web/components/ui/QueryState.vue";
import { useDiscover } from "#web/queries/media";

useTitle("Request media — Kyle");

const query = ref("");
const debounced = refDebounced(query, 300);
const term = computed(() => debounced.value.trim());

// Results are cached per term, so a slower reply for an earlier search cannot
// land on top of a later one.
const { data, error, isPending } = useDiscover(term);

const results = computed(() => data.value ?? []);
</script>
