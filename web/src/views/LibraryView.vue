<template>
  <AppPage>
    <PageHeader title="Library">
      <template #aside>
        <span v-if="!isPending" class="text-sm text-text-muted">
          {{ shown.length }} of {{ items.length }} · {{ formatSize(totalSize) }}
        </span>
      </template>
    </PageHeader>

    <div class="mb-3 flex gap-2">
      <AppInput
        :model-value="view.search"
        @update:model-value="view = { ...view, search: $event }"
        placeholder="Filter by title…"
        class="flex-1"
      />
      <AppButton
        size="icon"
        class="relative"
        :aria-label="filterButtonLabel"
        @click="sheetOpen = true"
      >
        <svg
          class="size-6"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <path d="M4 7h9M19 7h1M4 17h3M13 17h7" />
          <circle cx="16" cy="7" r="2.5" />
          <circle cx="10" cy="17" r="2.5" />
        </svg>
        <span
          v-if="changed.length"
          class="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-accent-purple text-[10px] font-bold text-text-inverse"
          aria-hidden="true"
        >
          {{ changed.length }}
        </span>
      </AppButton>
    </div>

    <div v-if="changed.length" class="mb-4 flex flex-wrap items-center gap-1.5">
      <button
        v-for="filterKey in changed"
        :key="filterKey"
        type="button"
        class="inline-flex min-h-8 items-center gap-1 rounded-full bg-accent-purple-light py-1 pr-2 pl-3 text-xs font-semibold text-accent-purple"
        :aria-label="`Stop ${filterKey === 'sort' ? 'sorting by' : 'filtering by'} ${filterLabel(filterKey, view)}`"
        @click="clearFilter(filterKey)"
      >
        {{ filterLabel(filterKey, view) }}
        <svg class="size-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path
            d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z"
          />
        </svg>
      </button>
    </div>

    <AppNotice v-if="unavailable.length" tone="amber" class="mb-4">
      {{ unavailable.join(" and ") }} {{ unavailable.length === 1 ? "is" : "are" }} unreachable, so
      part of the library is missing here.
    </AppNotice>

    <QueryState
      :loading="isPending"
      :error="error"
      :empty="shown.length === 0"
      empty-text="Nothing matches."
    >
      <template #loading><MediaRowSkeleton :count="6" /></template>

      <div class="stagger flex flex-col gap-2">
        <SwipeActions
          v-for="item in shown"
          :key="key(item)"
          :open="swiped === key(item)"
          :disabled="!isAdmin"
          @update:open="swiped = $event ? key(item) : ''"
        >
          <AppCard :interactive="!!item.tmdbId" class="group relative">
            <div class="flex items-center gap-3">
              <MediaPoster :src="item.posterUrl" :alt="item.title" />

              <div class="min-w-0 flex-1">
                <MediaTitle
                  :media-type="item.mediaType"
                  :tmdb-id="item.tmdbId"
                  :title="item.title"
                  wrap
                />
                <p class="mt-0.5 text-xs text-text-muted">
                  {{ describe(item) }}
                  <template v-if="item.availability === 'partial'">
                    · <span class="font-semibold text-accent-amber">{{ item.detail }}</span>
                  </template>
                  <template v-if="item.availability === 'missing'">
                    · <span class="font-semibold text-accent-red">Not on disk</span>
                  </template>
                </p>
                <p v-if="item.requestedBy.length" class="mt-0.5 truncate text-xs text-text-muted">
                  Requested by {{ formatNames(item.requestedBy) }}
                </p>
                <p v-if="failures[key(item)]" class="mt-1 text-xs text-accent-red">
                  {{ failures[key(item)] }}
                </p>
              </div>

              <div class="flex shrink-0 flex-col items-end gap-1.5">
                <span
                  v-if="item.sizeOnDisk > 0"
                  class="text-sm font-semibold text-text-primary tabular-nums"
                >
                  {{ formatSize(item.sizeOnDisk) }}
                </span>
                <WatcherAvatars :watchers="item.watchedBy" class="relative" />
              </div>

              <div v-if="isAdmin" class="relative hidden pointer-fine:block">
                <AppButton
                  variant="ghost"
                  aria-label="Remove"
                  size="icon"
                  class="text-text-muted opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-accent-red"
                  @click="onRemove(item)"
                >
                  <svg class="size-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path :d="TRASH_PATH" />
                  </svg>
                </AppButton>
              </div>
            </div>
          </AppCard>

          <template #action>
            <button
              type="button"
              class="flex aspect-square w-full flex-col items-center justify-center gap-0.5 rounded-card bg-accent-red text-[11px] font-semibold text-white"
              @click="onRemove(item)"
            >
              <svg class="size-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path :d="TRASH_PATH" />
              </svg>
              Remove
            </button>
          </template>
        </SwipeActions>
      </div>
    </QueryState>

    <LibraryFilterSheet v-model:open="sheetOpen" v-model:view="view" :count="shown.length" />

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
import { useEventListener, useTitle } from "@vueuse/core";
import { useRoute, useRouter } from "vue-router";
import type { LibraryItem } from "#web/api/library";
import { formatNames, formatSize } from "#web/utils/format";
import {
  applyLibraryView,
  changedFilters,
  DEFAULT_LIBRARY_VIEW,
  filterLabel,
  type LibraryFilterKey,
  type LibraryView,
  viewFromQuery,
  viewToQuery,
} from "#web/utils/library";
import LibraryFilterSheet from "#web/components/LibraryFilterSheet.vue";
import MediaRowSkeleton from "#web/components/MediaRowSkeleton.vue";
import MediaTitle from "#web/components/MediaTitle.vue";
import WatcherAvatars from "#web/components/WatcherAvatars.vue";
import AppButton from "#web/components/ui/AppButton.vue";
import AppCard from "#web/components/ui/AppCard.vue";
import AppInput from "#web/components/ui/AppInput.vue";
import AppNotice from "#web/components/ui/AppNotice.vue";
import AppPage from "#web/components/ui/AppPage.vue";
import ConfirmDialog from "#web/components/ui/ConfirmDialog.vue";
import MediaPoster from "#web/components/ui/MediaPoster.vue";
import PageHeader from "#web/components/ui/PageHeader.vue";
import QueryState from "#web/components/ui/QueryState.vue";
import SwipeActions from "#web/components/ui/SwipeActions.vue";
import { useLibrary, useRemoveLibraryItem } from "#web/queries/media";
import { useSession } from "#web/queries/session";

useTitle("Library — Kyle");

const TRASH_PATH =
  "M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z";

const { data, error, isPending } = useLibrary();
const { isAdmin } = useSession();
const remove = useRemoveLibraryItem();

const items = computed(() => data.value?.items ?? []);
const unavailable = computed(() => data.value?.unavailable ?? []);
const route = useRoute();
const router = useRouter();
const view = computed<LibraryView>({
  get: () => viewFromQuery(route.query),
  set: (next) => router.replace({ query: viewToQuery(next) }),
});
const sheetOpen = ref(false);
const swiped = ref("");
const removing = ref("");
const failures = ref<Record<string, string>>({});

const pending = ref<LibraryItem | null>(null);
const confirming = ref(false);

useEventListener(window, "scroll", () => (swiped.value = ""), { passive: true });

const confirmText = computed(() => {
  const item = pending.value;
  if (!item) return "";
  const size = item.sizeOnDisk > 0 ? ` and delete ${formatSize(item.sizeOnDisk)} from disk` : "";
  return `This removes “${item.title}” from the library${size}.`;
});

const key = (item: LibraryItem) => `${item.mediaType}-${item.serviceId}`;

const shown = computed(() => applyLibraryView(items.value, view.value));
const changed = computed(() => changedFilters(view.value));
const totalSize = computed(() => shown.value.reduce((sum, item) => sum + item.sizeOnDisk, 0));

const filterButtonLabel = computed(() => {
  if (changed.value.length === 0) return "Sort & filter";
  return `Sort & filter, ${changed.value.length} active`;
});

function describe(item: LibraryItem): string {
  const parts = [item.mediaType === "movie" ? "Movie" : "Series"];
  if (item.year) parts.push(String(item.year));
  if (!item.monitored) parts.push("unmonitored");
  return parts.join(" · ");
}

function clearFilter(filterKey: LibraryFilterKey) {
  view.value = { ...view.value, [filterKey]: DEFAULT_LIBRARY_VIEW[filterKey] };
}

function onRemove(item: LibraryItem) {
  swiped.value = "";
  pending.value = item;
  confirming.value = true;
}

async function confirmRemove() {
  const item = pending.value;
  if (!item) return;

  removing.value = key(item);
  delete failures.value[key(item)];
  try {
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
