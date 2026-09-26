<template>
  <BottomSheet
    :open="open"
    :title="title"
    description="Choose which seasons to download, and whether to follow the series."
    @update:open="emit('update:open', $event)"
  >
    <QueryState :loading="isPending" :error="error">
      <template #loading>
        <div class="flex flex-col gap-3">
          <Skeleton v-for="row in 3" :key="row" class="h-9 w-full" />
        </div>
      </template>

      <div v-if="options" class="flex flex-col gap-5">
        <section>
          <div class="mb-2.5 flex items-baseline justify-between gap-3">
            <h3 class="text-sm font-semibold tracking-wide text-text-muted uppercase">Download</h3>
            <div class="flex gap-1">
              <AppButton variant="ghost" size="sm" @click="chosen = regularSeasons(seasonList)">
                All
              </AppButton>
              <AppButton variant="ghost" size="sm" @click="chosen = latestSeason(seasonList)">
                Latest
              </AppButton>
              <AppButton variant="ghost" size="sm" @click="chosen = []">None</AppButton>
            </div>
          </div>

          <CheckboxGroupRoot v-model="seasons" class="flex flex-col gap-3">
            <AppCheckbox
              v-for="option in seasonList"
              :key="option.seasonNumber"
              :value="option.seasonNumber"
              :label="seasonName(option.seasonNumber)"
              :description="seasonDetail(option)"
            />
          </CheckboxGroupRoot>
        </section>

        <AppSwitch
          v-if="options.continuing"
          v-model="follow"
          label="Follow new seasons"
          description="Grab new seasons as they're announced."
        />

        <p v-if="failure" class="text-sm text-accent-red">{{ failure }}</p>
      </div>
    </QueryState>

    <template #footer>
      <AppButton variant="ghost" @click="emit('update:open', false)">Cancel</AppButton>
      <AppButton
        variant="primary"
        block
        class="flex-1"
        :disabled="!options || isEmptyChoice(seasons, follow)"
        :loading="busy"
        @click="emit('confirm', { seasons: [...seasons].sort(bySeason), follow })"
      >
        {{ busy ? "Requesting…" : choiceLabel(seasons, follow) }}
      </AppButton>
    </template>
  </BottomSheet>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { CheckboxGroupRoot } from "reka-ui";
import { seasonName } from "#shared/media";
import { useSeriesRequestOptions } from "#web/queries/media";
import {
  choiceLabel,
  isEmptyChoice,
  type SeriesChoice,
  latestSeason,
  regularSeasons,
  seasonDetail,
} from "#web/utils/season-choice";
import AppButton from "./ui/AppButton.vue";
import AppCheckbox from "./ui/AppCheckbox.vue";
import AppSwitch from "./ui/AppSwitch.vue";
import BottomSheet from "./ui/BottomSheet.vue";
import QueryState from "./ui/QueryState.vue";
import Skeleton from "./ui/Skeleton.vue";

const props = defineProps<{
  open: boolean;
  tmdbId: number;
  title: string;
  busy?: boolean;
  failure?: string;
}>();

const emit = defineEmits<{ "update:open": [boolean]; confirm: [SeriesChoice] }>();

const {
  data: options,
  isPending,
  error,
} = useSeriesRequestOptions(
  () => props.tmdbId,
  () => props.open,
);

const seasonList = computed(() => options.value?.seasons ?? []);

// Untouched, the choice is the default: every regular season, following a
// series still airing. Only what someone changes is held here.
const chosen = ref<number[] | null>(null);
const followChosen = ref<boolean | null>(null);

const seasons = computed({
  get: () => chosen.value ?? regularSeasons(seasonList.value),
  set: (value: number[]) => {
    chosen.value = value;
  },
});

const follow = computed({
  get: () => (options.value?.continuing ? (followChosen.value ?? true) : false),
  set: (value: boolean) => {
    followChosen.value = value;
  },
});

/** In order, with specials last, as the list shows them. */
function bySeason(a: number, b: number): number {
  if (a === 0) return 1;
  if (b === 0) return -1;
  return a - b;
}
</script>
