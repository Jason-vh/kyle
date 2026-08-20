<template>
  <div class="mx-auto max-w-[700px] p-4 sm:p-8">
    <header class="mb-5">
      <h1 class="text-xl font-semibold text-text-primary">Request media</h1>
      <p class="mt-1 text-sm text-text-muted">
        Search for a movie or series and add it to the library.
      </p>
    </header>

    <input
      v-model="query"
      type="search"
      placeholder="Search for a movie or series…"
      autocomplete="off"
      autofocus
      class="mb-5 w-full rounded-lg border border-border-primary bg-bg-input px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent-purple focus:outline-none focus:ring-2 focus:ring-accent-purple/20"
    />

    <div v-if="error" class="py-8 text-center text-sm text-accent-red">{{ error }}</div>
    <div v-else-if="loading" class="py-8 text-center text-sm text-text-muted">Searching…</div>
    <div v-else-if="!query.trim()" class="py-8 text-center text-sm text-text-muted">
      Start typing to find something.
    </div>
    <div v-else-if="results.length === 0" class="py-8 text-center text-sm text-text-muted">
      Nothing found for “{{ query }}”.
    </div>
    <div v-else class="flex flex-col gap-2">
      <MediaCard v-for="item in results" :key="`${item.mediaType}-${item.tmdbId}`" :item="item" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { useTitle } from "@vueuse/core";
import { refDebounced } from "@vueuse/core";
import { discover, type DiscoverResult } from "../api/requests";
import MediaCard from "../components/MediaCard.vue";

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
