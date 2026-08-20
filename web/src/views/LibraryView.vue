<template>
  <div class="mx-auto max-w-[700px] p-4 sm:p-8">
    <header class="mb-4 flex items-baseline justify-between gap-4">
      <h1 class="text-xl font-semibold text-text-primary">Library</h1>
      <span v-if="!loading" class="text-sm text-text-muted">
        {{ filtered.length }} of {{ items.length }} · {{ formatSize(totalSize) }}
      </span>
    </header>

    <input
      v-model="search"
      type="search"
      placeholder="Filter by title…"
      autocomplete="off"
      class="mb-3 w-full rounded-lg border border-border-primary bg-bg-input px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent-purple focus:outline-none focus:ring-2 focus:ring-accent-purple/20"
    />

    <div class="mb-5 flex flex-wrap gap-1.5">
      <button
        v-for="option in FILTERS"
        :key="option.value"
        class="rounded-full border px-3 py-1 text-xs font-semibold transition-colors"
        :class="
          filter === option.value
            ? 'border-accent-purple bg-accent-purple-light text-accent-purple'
            : 'border-border-primary text-text-muted hover:text-text-primary'
        "
        @click="filter = option.value"
      >
        {{ option.label }}
      </button>
    </div>

    <div v-if="loading" class="py-12 text-center text-text-muted">Loading…</div>
    <div v-else-if="error" class="py-12 text-center text-sm text-accent-red">{{ error }}</div>
    <div v-else-if="filtered.length === 0" class="py-12 text-center text-sm text-text-muted">
      Nothing matches.
    </div>

    <div v-else class="flex flex-col gap-2">
      <div
        v-for="item in filtered"
        :key="`${item.mediaType}-${item.serviceId}`"
        class="flex items-center gap-3 rounded-lg border border-border-primary bg-bg-surface p-3"
      >
        <div class="h-[72px] w-[48px] shrink-0 overflow-hidden rounded-md bg-bg-input">
          <img
            v-if="item.posterUrl"
            :src="item.posterUrl"
            :alt="item.title"
            loading="lazy"
            class="size-full object-cover"
          />
          <div
            v-else
            class="flex size-full items-center justify-center text-[10px] text-text-muted"
          >
            No art
          </div>
        </div>

        <div class="min-w-0 flex-1">
          <div class="flex items-baseline gap-2">
            <h3 class="truncate text-sm font-semibold text-text-primary">{{ item.title }}</h3>
            <span v-if="item.year" class="shrink-0 text-xs text-text-muted">{{ item.year }}</span>
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

        <span class="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold" :class="badge(item)">
          {{ LABELS[item.availability] }}
        </span>

        <button
          v-if="isAdmin"
          :disabled="removing === key(item)"
          class="shrink-0 rounded-lg border border-border-primary px-2.5 py-1 text-xs font-semibold text-accent-red transition-colors hover:bg-accent-red-light disabled:opacity-50"
          @click="onRemove(item)"
        >
          {{ removing === key(item) ? "Removing…" : "Remove" }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useTitle } from "@vueuse/core";
import { getAuthStatus } from "../api/auth";
import { formatSize, getLibrary, removeLibraryItem, type LibraryItem } from "../api/library";

useTitle("Library — Kyle");

type Filter = "all" | "movie" | "series" | "partial" | "missing" | "mine";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "movie", label: "Movies" },
  { value: "series", label: "Series" },
  { value: "partial", label: "Incomplete" },
  { value: "missing", label: "Nothing on disk" },
  { value: "mine", label: "Requested by me" },
];

/** "Bob", "Bob and Jane", "Bob, Jane and Sue". */
function formatNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

const LABELS: Record<LibraryItem["availability"], string> = {
  available: "Complete",
  partial: "Partial",
  missing: "Missing",
};

const BADGES: Record<LibraryItem["availability"], string> = {
  available: "bg-accent-green-light text-accent-green",
  partial: "bg-accent-amber-light text-accent-amber",
  missing: "bg-accent-red-light text-accent-red",
};

const items = ref<LibraryItem[]>([]);
const loading = ref(true);
const error = ref("");
const isAdmin = ref(false);
const search = ref("");
const filter = ref<Filter>("all");
const removing = ref("");
const failures = ref<Record<string, string>>({});

const key = (item: LibraryItem) => `${item.mediaType}-${item.serviceId}`;
const badge = (item: LibraryItem) => BADGES[item.availability];

const filtered = computed(() => {
  const term = search.value.trim().toLowerCase();
  return items.value.filter((item) => {
    if (term && !item.title.toLowerCase().includes(term)) return false;
    if (filter.value === "all") return true;
    if (filter.value === "mine") return item.requestedByMe;
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
    items.value = await getLibrary();
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
