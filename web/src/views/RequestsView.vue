<template>
  <AppPage>
    <PageHeader title="Requests">
      <template #aside>
        <AppButton v-if="isAdmin" variant="ghost" size="sm" @click="toggleScope">
          {{ showAll ? "Only mine" : "Everyone's" }}
        </AppButton>
      </template>
    </PageHeader>

    <QueryState :loading="loading" :error="error" :empty="requests.length === 0">
      <template #empty>
        Nothing requested yet.
        <router-link to="/discover" class="text-accent-purple hover:underline">
          Request something
        </router-link>
      </template>

      <div class="flex flex-col gap-2">
        <AppCard v-for="request in requests" :key="request.id">
          <div class="flex items-center gap-3">
            <MediaPoster :src="posterUrl(request.posterPath)" :alt="request.title" />
            <div class="min-w-0 flex-1">
              <div class="flex items-baseline gap-2">
                <h3 class="truncate text-sm font-semibold text-text-primary">
                  {{ request.title }}
                </h3>
                <span v-if="request.year" class="shrink-0 text-xs text-text-muted">
                  {{ request.year }}
                </span>
              </div>
              <p class="mt-0.5 text-xs text-text-muted">
                {{ request.mediaType === "movie" ? "Movie" : "Series" }}
                <template v-if="request.requestedBy"> · {{ request.requestedBy }}</template>
              </p>
            </div>
            <span class="shrink-0 text-xs text-text-muted">
              {{ relativeTime(request.createdAt) }}
            </span>
          </div>
        </AppCard>
      </div>
    </QueryState>
  </AppPage>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useTitle } from "@vueuse/core";
import { getAuthStatus } from "../api/auth";
import { getRequests, posterUrl, type MediaRequest } from "../api/requests";
import { relativeTime } from "../composables/useRelativeTime";
import AppButton from "../components/ui/AppButton.vue";
import AppCard from "../components/ui/AppCard.vue";
import AppPage from "../components/ui/AppPage.vue";
import MediaPoster from "../components/ui/MediaPoster.vue";
import PageHeader from "../components/ui/PageHeader.vue";
import QueryState from "../components/ui/QueryState.vue";

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
