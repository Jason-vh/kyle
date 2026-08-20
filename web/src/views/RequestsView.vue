<template>
  <div class="mx-auto max-w-[700px] p-4 sm:p-8">
    <header class="mb-5 flex items-baseline justify-between gap-4">
      <h1 class="text-xl font-semibold text-text-primary">Requests</h1>
      <button
        v-if="isAdmin"
        class="text-sm text-accent-purple hover:underline"
        @click="toggleScope"
      >
        {{ showAll ? "Show only mine" : "Show everyone's" }}
      </button>
    </header>

    <div v-if="loading" class="py-12 text-center text-text-muted">Loading…</div>
    <div v-else-if="error" class="py-12 text-center text-accent-red">{{ error }}</div>
    <div v-else-if="requests.length === 0" class="py-12 text-center text-sm text-text-muted">
      Nothing requested yet.
      <router-link to="/discover" class="text-accent-purple hover:underline">
        Request something
      </router-link>
    </div>
    <div v-else class="flex flex-col gap-2">
      <div
        v-for="request in requests"
        :key="request.id"
        class="flex items-center gap-3 rounded-lg border border-border-primary bg-bg-surface p-3"
      >
        <div class="h-[72px] w-[48px] shrink-0 overflow-hidden rounded-md bg-bg-input">
          <img
            v-if="posterUrl(request.posterPath)"
            :src="posterUrl(request.posterPath)!"
            :alt="request.title"
            loading="lazy"
            class="size-full object-cover"
          />
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-baseline gap-2">
            <h3 class="truncate text-sm font-semibold text-text-primary">{{ request.title }}</h3>
            <span v-if="request.year" class="shrink-0 text-xs text-text-muted">
              {{ request.year }}
            </span>
          </div>
          <p class="mt-0.5 text-xs text-text-muted">
            {{ request.mediaType === "movie" ? "Movie" : "Series" }}
            <template v-if="request.requestedBy"> · {{ request.requestedBy }}</template>
          </p>
        </div>
        <span class="shrink-0 text-xs text-text-muted">{{ relativeTime(request.createdAt) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useTitle } from "@vueuse/core";
import { getAuthStatus } from "../api/auth";
import { getRequests, posterUrl, type MediaRequest } from "../api/requests";
import { relativeTime } from "../composables/useRelativeTime";

useTitle("Requests — Kyle");

const requests = ref<MediaRequest[]>([]);
const loading = ref(true);
const error = ref("");
const isAdmin = ref(false);
const showAll = ref(false);

async function load() {
  loading.value = true;
  error.value = "";
  try {
    requests.value = await getRequests(showAll.value);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Could not load requests";
  } finally {
    loading.value = false;
  }
}

function toggleScope() {
  showAll.value = !showAll.value;
  void load();
}

onMounted(async () => {
  isAdmin.value = (await getAuthStatus()).user?.admin ?? false;
  await load();
});
</script>
