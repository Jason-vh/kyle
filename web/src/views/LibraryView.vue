<template>
  <AppPage>
    <PageHeader title="Library">
      <template #aside>
        <span v-if="!loading" class="text-sm text-text-muted">
          {{ filtered.length }} of {{ items.length }} · {{ formatSize(totalSize) }}
        </span>
      </template>
    </PageHeader>

    <AppInput v-model="search" placeholder="Filter by title…" class="mb-3" />
    <FilterChips v-model="filter" :options="FILTERS" class="mb-5" />

    <AppNotice v-if="unavailable.length" tone="amber" class="mb-4">
      {{ unavailable.join(" and ") }} {{ unavailable.length === 1 ? "is" : "are" }} unreachable, so
      part of the library is missing here.
    </AppNotice>

    <QueryState
      :loading="loading"
      :error="error"
      :empty="filtered.length === 0"
      empty-text="Nothing matches."
    >
      <div class="flex flex-col gap-2">
        <AppCard v-for="item in filtered" :key="key(item)">
          <div class="flex items-center gap-3">
            <MediaPoster :src="item.posterUrl" :alt="item.title" />

            <div class="min-w-0 flex-1">
              <div class="flex items-baseline gap-2">
                <h3 class="truncate text-sm font-semibold text-text-primary">{{ item.title }}</h3>
                <span v-if="item.year" class="shrink-0 text-xs text-text-muted">
                  {{ item.year }}
                </span>
              </div>
              <p class="mt-0.5 text-xs text-text-muted">
                {{ item.mediaType === "movie" ? "Movie" : "Series" }}
                <template v-if="item.detail"> · {{ item.detail }}</template>
                <template v-if="item.sizeOnDisk > 0"> · {{ formatSize(item.sizeOnDisk) }}</template>
                <template v-if="!item.monitored"> · unmonitored</template>
              </p>
              <p v-if="item.requestedBy.length" class="mt-0.5 truncate text-xs text-text-muted">
                Requested by {{ formatNames(item.requestedBy) }}
              </p>
              <p v-if="failures[key(item)]" class="mt-1 text-xs text-accent-red">
                {{ failures[key(item)] }}
              </p>
            </div>

            <WatcherAvatars :watchers="item.watchedBy" class="shrink-0" />

            <StatusPill :tone="TONES[item.availability]">
              {{ LABELS[item.availability] }}
            </StatusPill>

            <AppButton
              v-if="isAdmin"
              variant="danger"
              size="sm"
              :loading="removing === key(item)"
              @click="onRemove(item)"
            >
              {{ removing === key(item) ? "Removing…" : "Remove" }}
            </AppButton>
          </div>
        </AppCard>
      </div>
    </QueryState>
  </AppPage>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useTitle } from "@vueuse/core";
import { getAuthStatus } from "../api/auth";
import { getLibrary, removeLibraryItem, type LibraryItem } from "../api/library";
import { formatNames, formatSize } from "../utils/format";
import WatcherAvatars from "../components/WatcherAvatars.vue";
import AppButton from "../components/ui/AppButton.vue";
import AppCard from "../components/ui/AppCard.vue";
import AppInput from "../components/ui/AppInput.vue";
import AppNotice from "../components/ui/AppNotice.vue";
import AppPage from "../components/ui/AppPage.vue";
import FilterChips from "../components/ui/FilterChips.vue";
import PageHeader from "../components/ui/PageHeader.vue";
import QueryState from "../components/ui/QueryState.vue";
import StatusPill from "../components/ui/StatusPill.vue";
import type { Tone } from "../components/ui/types";

useTitle("Library — Kyle");

type Filter = "all" | "movie" | "series" | "partial" | "missing" | "mine" | "unwatched";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "movie", label: "Movies" },
  { value: "series", label: "Series" },
  { value: "partial", label: "Incomplete" },
  { value: "missing", label: "Nothing on disk" },
  { value: "mine", label: "Requested by me" },
  { value: "unwatched", label: "Nobody has watched" },
];

const LABELS: Record<LibraryItem["availability"], string> = {
  available: "Complete",
  partial: "Partial",
  missing: "Missing",
};

const TONES: Record<LibraryItem["availability"], Tone> = {
  available: "green",
  partial: "amber",
  missing: "red",
};

const items = ref<LibraryItem[]>([]);
const unavailable = ref<string[]>([]);
const loading = ref(true);
const error = ref("");
const isAdmin = ref(false);
const search = ref("");
const filter = ref<Filter>("all");
const removing = ref("");
const failures = ref<Record<string, string>>({});

const key = (item: LibraryItem) => `${item.mediaType}-${item.serviceId}`;

const filtered = computed(() => {
  const term = search.value.trim().toLowerCase();
  return items.value.filter((item) => {
    if (term && !item.title.toLowerCase().includes(term)) return false;
    if (filter.value === "all") return true;
    if (filter.value === "mine") return item.requestedByMe;
    // Worth seeing next to size: nobody has watched it and it is taking space.
    if (filter.value === "unwatched") {
      return item.watchedBy.length === 0 && item.availability !== "missing";
    }
    if (filter.value === "movie" || filter.value === "series") {
      return item.mediaType === filter.value;
    }
    return item.availability === filter.value;
  });
});

const totalSize = computed(() => filtered.value.reduce((sum, item) => sum + item.sizeOnDisk, 0));

onMounted(async () => {
  isAdmin.value = (await getAuthStatus()).user?.admin ?? false;
  try {
    const listing = await getLibrary();
    items.value = listing.items;
    unavailable.value = listing.unavailable;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Could not load the library";
  } finally {
    loading.value = false;
  }
});

async function onRemove(item: LibraryItem) {
  // One decision only: cancelling must leave everything alone.
  const sizeNote =
    item.sizeOnDisk > 0 ? ` and delete ${formatSize(item.sizeOnDisk)} from disk` : "";
  if (!window.confirm(`Remove “${item.title}”${sizeNote}?`)) return;

  removing.value = key(item);
  delete failures.value[key(item)];
  try {
    await removeLibraryItem(item, true);
    items.value = items.value.filter((i) => key(i) !== key(item));
  } catch (e) {
    failures.value[key(item)] = e instanceof Error ? e.message : "Could not remove this";
  } finally {
    removing.value = "";
  }
}
</script>
