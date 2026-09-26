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
        <IconSliders class="size-6" aria-hidden="true" />
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
        <IconX class="size-3.5" aria-hidden="true" />
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
          v-for="{ item, status } in rows"
          :key="key(item)"
          :open="swiped === key(item)"
          :disabled="!isAdmin"
          @update:open="swiped = $event ? key(item) : ''"
        >
          <AppCard :interactive="!!item.tmdbId" class="group relative">
            <div class="flex items-center gap-3">
              <MediaPoster :src="item.posterUrl" :alt="item.title" />

              <div class="min-w-0 flex-1">
                <div class="flex items-start gap-2">
                  <MediaTitle
                    :media-type="item.mediaType"
                    :tmdb-id="item.tmdbId"
                    :title="item.title"
                    :year="item.year"
                    wrap
                    class="min-w-0 flex-1"
                  />
                  <WatcherAvatars
                    :watchers="item.requestedBy"
                    :max="2"
                    verb="requested this"
                    class="relative"
                  />
                </div>
                <p class="mt-0.5 text-xs text-text-muted">
                  {{ librarySummary(item) }}
                  <template v-if="item.availability === 'partial' && item.episodes">
                    ·
                    <span class="font-semibold text-accent-amber">
                      {{ item.episodes.present }}/{{ item.episodes.total }} episodes
                    </span>
                  </template>
                  <template v-if="status">
                    ·
                    <span class="font-semibold" :class="TONE_TEXT[status.tone]">
                      <template v-if="status.downloading">
                        <IconDownload
                          class="mr-0.5 inline size-3.5 align-[-2px]"
                          aria-hidden="true"
                        />
                        <span class="sr-only">Downloading</span>
                      </template>
                      {{ status.label }}
                    </span>
                  </template>
                  <template v-if="!item.monitored"> · unmonitored</template>
                </p>
                <p v-if="item.watchedBy.length" class="mt-1 text-xs text-text-muted">
                  {{ watchedLabel(item.watchedBy) }}
                </p>
                <p v-if="failures[key(item)]" class="mt-1 text-xs text-accent-red">
                  {{ failures[key(item)] }}
                </p>
              </div>

              <div v-if="isAdmin" class="relative hidden pointer-fine:block">
                <AppButton
                  variant="ghost"
                  aria-label="Remove"
                  size="icon"
                  class="text-text-muted opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-accent-red"
                  @click="onRemove(item)"
                >
                  <IconTrash class="size-5" aria-hidden="true" />
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
              <IconTrash class="size-5" aria-hidden="true" />
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
import { formatSize } from "#web/utils/format";
import {
  applyLibraryView,
  changedFilters,
  DEFAULT_LIBRARY_VIEW,
  downloadStatus,
  filterLabel,
  librarySummary,
  type LibraryFilterKey,
  type LibraryView,
  viewFromQuery,
  viewToQuery,
  watchedLabel,
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
import type { Tone } from "#web/components/ui/types";
import { useLibrary, useRemoveLibraryItem } from "#web/queries/media";
import IconDownload from "~icons/ph/download-simple-bold";
import IconSliders from "~icons/ph/sliders-horizontal";
import IconTrash from "~icons/ph/trash";
import IconX from "~icons/ph/x";
import { useSession } from "#web/queries/session";

useTitle("Library — Kyle");

const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-text-muted",
  green: "text-accent-green",
  amber: "text-accent-amber",
  red: "text-accent-red",
  purple: "text-accent-purple",
  blue: "text-accent-blue",
};

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
const rows = computed(() => shown.value.map((item) => ({ item, status: downloadStatus(item) })));
const changed = computed(() => changedFilters(view.value));
const totalSize = computed(() => shown.value.reduce((sum, item) => sum + item.sizeOnDisk, 0));

const filterButtonLabel = computed(() => {
  if (changed.value.length === 0) return "Sort & filter";
  return `Sort & filter, ${changed.value.length} active`;
});

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
