<template>
  <AppPage>
    <PageHeader title="Library">
      <template #aside>
        <span v-if="!isPending" class="text-sm text-text-muted tabular-nums">{{ countLabel }}</span>
      </template>
    </PageHeader>

    <LibraryStorage
      v-if="storage"
      :storage="storage"
      :movie-bytes="movieBytes"
      :series-bytes="seriesBytes"
      class="-mt-2 mb-3"
    />

    <div
      class="sticky top-header z-5 -mx-4 flex gap-2 bg-bg-base/85 px-4 py-2 backdrop-blur-md sm:-mx-6 sm:px-6"
    >
      <AppInput
        :model-value="view.search"
        @update:model-value="view = { ...view, search: $event }"
        placeholder="Search library"
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

    <div v-if="changed.length" class="mt-1 mb-2 flex flex-wrap items-center gap-1.5">
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

    <AppNotice v-if="unavailable.length" tone="amber" class="my-2">
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

      <div class="stagger flex flex-col pt-2" @touchstart.passive="enablePressFeedback">
        <section v-for="group in groups" :key="group.letter">
          <h2 v-if="group.letter" class="px-1 pt-3 pb-1.5 text-xs font-bold text-text-muted">
            {{ group.letter }}
          </h2>
          <AppCard as="ul" :padded="false">
            <LibraryRow
              v-for="item in group.items"
              :key="`${item.mediaType}-${item.serviceId}`"
              :item="item"
              :size-first="view.sort === 'size'"
            />
          </AppCard>
        </section>
      </div>
    </QueryState>

    <LibraryFilterSheet v-model:open="sheetOpen" v-model:view="view" :count="shown.length" />
  </AppPage>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useTitle } from "@vueuse/core";
import { useRoute, useRouter } from "vue-router";
import type { LibraryItem } from "#web/api/library";
import { formatSize } from "#web/utils/format";
import {
  applyLibraryView,
  changedFilters,
  DEFAULT_LIBRARY_VIEW,
  filterLabel,
  groupByLetter,
  type LetterGroup,
  type LibraryFilterKey,
  type LibraryView,
  viewFromQuery,
  viewToQuery,
} from "#web/utils/library";
import LibraryFilterSheet from "#web/components/LibraryFilterSheet.vue";
import LibraryRow from "#web/components/LibraryRow.vue";
import LibraryStorage from "#web/components/LibraryStorage.vue";
import MediaRowSkeleton from "#web/components/MediaRowSkeleton.vue";
import AppButton from "#web/components/ui/AppButton.vue";
import AppCard from "#web/components/ui/AppCard.vue";
import AppInput from "#web/components/ui/AppInput.vue";
import AppNotice from "#web/components/ui/AppNotice.vue";
import AppPage from "#web/components/ui/AppPage.vue";
import PageHeader from "#web/components/ui/PageHeader.vue";
import QueryState from "#web/components/ui/QueryState.vue";
import { useLibrary } from "#web/queries/media";
import IconSliders from "~icons/ph/sliders-horizontal";
import IconX from "~icons/ph/x";

useTitle("Library — Kyle");

const { data, error, isPending } = useLibrary();

const items = computed(() => data.value?.items ?? []);
const unavailable = computed(() => data.value?.unavailable ?? []);
const storage = computed(() => data.value?.storage);
const route = useRoute();
const router = useRouter();
const view = computed<LibraryView>({
  get: () => viewFromQuery(route.query),
  set: (next) => router.replace({ query: viewToQuery(next) }),
});
const sheetOpen = ref(false);

const shown = computed(() => applyLibraryView(items.value, view.value));
const groups = computed<LetterGroup[]>(() => {
  if (view.value.sort === "title" && !view.value.search.trim()) return groupByLetter(shown.value);
  return [{ letter: "", items: shown.value }];
});
const changed = computed(() => changedFilters(view.value));

const bytesOf = (list: LibraryItem[]) => list.reduce((sum, item) => sum + item.sizeOnDisk, 0);
const totalSize = computed(() => bytesOf(shown.value));
const movieBytes = computed(() =>
  bytesOf(items.value.filter((item) => item.mediaType === "movie")),
);
const seriesBytes = computed(() =>
  bytesOf(items.value.filter((item) => item.mediaType === "series")),
);

const countLabel = computed(() => {
  const size = formatSize(totalSize.value);
  if (shown.value.length === items.value.length) {
    const noun = items.value.length === 1 ? "title" : "titles";
    return `${items.value.length} ${noun} · ${size}`;
  }
  return `${shown.value.length} of ${items.value.length} · ${size}`;
});

const filterButtonLabel = computed(() => {
  if (changed.value.length === 0) return "Sort & filter";
  return `Sort & filter, ${changed.value.length} active`;
});

function clearFilter(filterKey: LibraryFilterKey) {
  view.value = { ...view.value, [filterKey]: DEFAULT_LIBRARY_VIEW[filterKey] };
}

function enablePressFeedback() {}
</script>
