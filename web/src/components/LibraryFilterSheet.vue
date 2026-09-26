<template>
  <BottomSheet
    v-model:open="open"
    title="Sort & filter"
    description="Choose the order of the library and which titles it shows."
  >
    <div class="flex flex-col gap-5">
      <section>
        <SectionHeading title="Sort by" />
        <FilterChips
          :model-value="view.sort"
          :options="SORT_OPTIONS"
          label="Sort by"
          @update:model-value="set('sort', $event)"
        />
      </section>

      <section>
        <SectionHeading title="Type" />
        <FilterChips
          :model-value="view.type"
          :options="TYPE_OPTIONS"
          label="Type"
          @update:model-value="set('type', $event)"
        />
      </section>

      <section>
        <SectionHeading title="On disk" />
        <FilterChips
          :model-value="view.availability"
          :options="AVAILABILITY_OPTIONS"
          label="On disk"
          @update:model-value="set('availability', $event)"
        />
      </section>

      <section class="flex flex-col gap-4">
        <AppSwitch
          :model-value="view.requestedByMe"
          label="Requested by me"
          description="Only what you asked for."
          @update:model-value="set('requestedByMe', $event)"
        />
        <AppSwitch
          :model-value="view.unwatched"
          label="Nobody has watched"
          description="On disk, but never played on Plex."
          @update:model-value="set('unwatched', $event)"
        />
      </section>
    </div>

    <template #footer>
      <AppButton variant="ghost" :disabled="!changed" @click="reset">Reset</AppButton>
      <AppButton variant="primary" block class="flex-1" @click="open = false">
        {{ showLabel }}
      </AppButton>
    </template>
  </BottomSheet>
</template>

<script setup lang="ts">
import { computed } from "vue";
import {
  AVAILABILITY_OPTIONS,
  changedFilters,
  DEFAULT_LIBRARY_VIEW,
  type LibraryView,
  SORT_OPTIONS,
  TYPE_OPTIONS,
} from "#web/utils/library";
import AppButton from "./ui/AppButton.vue";
import AppSwitch from "./ui/AppSwitch.vue";
import BottomSheet from "./ui/BottomSheet.vue";
import FilterChips from "./ui/FilterChips.vue";
import SectionHeading from "./ui/SectionHeading.vue";

const props = defineProps<{ count: number }>();

const open = defineModel<boolean>("open", { required: true });
const view = defineModel<LibraryView>("view", { required: true });

const changed = computed(() => changedFilters(view.value).length > 0);

const showLabel = computed(() => {
  if (props.count === 0) return "Nothing matches";
  return `Show ${props.count} ${props.count === 1 ? "title" : "titles"}`;
});

function set<K extends keyof LibraryView>(key: K, value: LibraryView[K]) {
  view.value = { ...view.value, [key]: value };
}

function reset() {
  view.value = { ...DEFAULT_LIBRARY_VIEW, search: view.value.search };
}
</script>
