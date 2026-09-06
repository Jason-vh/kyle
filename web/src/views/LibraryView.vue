<template>
  <AppPage>
    <PageHeader title="Library">
      <template #aside>
        <span v-if="!isPending" class="text-sm text-text-muted">
          {{ filtered.length }} of {{ items.length }} · {{ formatSize(totalSize) }}
        </span>
      </template>
    </PageHeader>

    <AppInput v-model="search" placeholder="Filter by title…" class="mb-3" />
    <FilterChips v-model="filter" :options="FILTERS" label="Filter the library" class="mb-5" />

    <AppNotice v-if="unavailable.length" tone="amber" class="mb-4">
      {{ unavailable.join(" and ") }} {{ unavailable.length === 1 ? "is" : "are" }} unreachable, so
      part of the library is missing here.
    </AppNotice>

    <QueryState
      :loading="isPending"
      :error="error"
      :empty="filtered.length === 0"
      empty-text="Nothing matches."
    >
      <template #loading><MediaRowSkeleton :count="6" /></template>

      <div class="flex flex-col gap-2">
        <AppCard v-for="item in filtered" :key="key(item)">
          <div class="flex items-center gap-3">
            <MediaPoster :src="item.posterUrl" :alt="item.title" />

            <div class="min-w-0 flex-1">
              <div class="flex items-baseline gap-2">
                <MediaTitle
                  :media-type="item.mediaType"
                  :tmdb-id="item.tmdbId"
                  :title="item.title"
                />
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

    <ConfirmDialog
      v-model:open="confirming"
      title="Remove from the library?"
      :description="confirmText"
      confirm-label="Remove"
      busy-label="Removing…"
      :busy="removing !== ''"
      @confirm="confirmRemove"
    />
  </AppPage>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useTitle } from "@vueuse/core";
import type { LibraryItem } from "#web/api/library";
import { formatNames, formatSize } from "#web/utils/format";
import MediaRowSkeleton from "#web/components/MediaRowSkeleton.vue";
import MediaTitle from "#web/components/MediaTitle.vue";
import WatcherAvatars from "#web/components/WatcherAvatars.vue";
import AppButton from "#web/components/ui/AppButton.vue";
import AppCard from "#web/components/ui/AppCard.vue";
import AppInput from "#web/components/ui/AppInput.vue";
import AppNotice from "#web/components/ui/AppNotice.vue";
import AppPage from "#web/components/ui/AppPage.vue";
import ConfirmDialog from "#web/components/ui/ConfirmDialog.vue";
import FilterChips from "#web/components/ui/FilterChips.vue";
import PageHeader from "#web/components/ui/PageHeader.vue";
import QueryState from "#web/components/ui/QueryState.vue";
import StatusPill from "#web/components/ui/StatusPill.vue";
import type { Tone } from "#web/components/ui/types";
import { useLibrary, useRemoveLibraryItem } from "#web/queries/media";
import { useSession } from "#web/queries/session";

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

const { data, error, isPending } = useLibrary();
const { isAdmin } = useSession();
const remove = useRemoveLibraryItem();

const items = computed(() => data.value?.items ?? []);
const unavailable = computed(() => data.value?.unavailable ?? []);
const search = ref("");
const filter = ref<Filter>("all");
const removing = ref("");
const failures = ref<Record<string, string>>({});

// The item awaiting confirmation, held apart from the one being removed so the
// dialog can say what it is about to do.
const pending = ref<LibraryItem | null>(null);
const confirming = ref(false);

const confirmText = computed(() => {
  const item = pending.value;
  if (!item) return "";
  const size = item.sizeOnDisk > 0 ? ` and delete ${formatSize(item.sizeOnDisk)} from disk` : "";
  return `This removes “${item.title}” from the library${size}.`;
});

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

function onRemove(item: LibraryItem) {
  pending.value = item;
  confirming.value = true;
}

async function confirmRemove() {
  const item = pending.value;
  if (!item) return;

  removing.value = key(item);
  delete failures.value[key(item)];
  try {
    // The listing refreshes itself once the mutation settles.
    await remove.mutateAsync(item);
    confirming.value = false;
  } catch (e) {
    failures.value[key(item)] = e instanceof Error ? e.message : "Could not remove this";
    confirming.value = false;
  } finally {
    removing.value = "";
  }
}
</script>
