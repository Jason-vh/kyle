<template>
  <AppPage>
    <PageHeader title="Request media" subtitle="Search for a movie or series and add it." />

    <AppInput v-model="query" placeholder="Search for a movie or series…" class="mb-5" autofocus />

    <p v-if="!query.trim()" class="py-12 text-center text-sm text-text-muted">
      Start typing to find something.
    </p>
    <QueryState
      v-else
      :loading="loading"
      :error="error"
      :empty="results.length === 0"
      loading-text="Searching…"
      :empty-text="`Nothing found for “${query}”.`"
    >
      <div class="flex flex-col gap-2">
        <MediaCard v-for="item in results" :key="`${item.mediaType}-${item.tmdbId}`" :item="item" />
      </div>
    </QueryState>
  </AppPage>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { refDebounced, useTitle } from "@vueuse/core";
import { discover, type DiscoverResult } from "../api/requests";
import MediaCard from "../components/MediaCard.vue";
import AppInput from "../components/ui/AppInput.vue";
import AppPage from "../components/ui/AppPage.vue";
import PageHeader from "../components/ui/PageHeader.vue";
import QueryState from "../components/ui/QueryState.vue";

useTitle("Request media — Kyle");

const query = ref("");
const debouncedQuery = refDebounced(query, 300);
const results = ref<DiscoverResult[]>([]);
const loading = ref(false);
const error = ref("");

// A slower reply must not overwrite the results of a later search.
let latestSearch = 0;

watch(debouncedQuery, async (value) => {
  const term = value.trim();
  const search = ++latestSearch;

  if (!term) {
    results.value = [];
    loading.value = false;
    return;
  }

  loading.value = true;
  error.value = "";
  try {
    const found = await discover(term);
    if (search !== latestSearch) return;
    results.value = found;
  } catch (e) {
    if (search !== latestSearch) return;
    error.value = e instanceof Error ? e.message : "Search failed";
  } finally {
    if (search === latestSearch) loading.value = false;
  }
});
</script>
