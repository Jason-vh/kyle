<template>
  <div>
    <AppButton v-if="requested" variant="ghost" :size="size" disabled>Requested</AppButton>

    <!-- A series already held is managed season by season on its own page. -->
    <AppButton v-else-if="choosesSeasons && held" as-child :size="size">
      <RouterLink :to="`/media/series/${item.tmdbId}`">Seasons</RouterLink>
    </AppButton>

    <AppButton v-else variant="primary" :size="size" :loading="busy" @click="onRequest">
      {{ label }}
    </AppButton>

    <p v-if="error && !sheetOpen" class="mt-1 text-xs text-accent-red">{{ error }}</p>

    <SeriesRequestSheet
      v-if="choosesSeasons"
      v-model:open="sheetOpen"
      :tmdb-id="item.tmdbId"
      :title="item.title"
      :busy="busy"
      :failure="error"
      @confirm="onChoose"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import type { RequestInput } from "#web/api/requests";
import { useRequestMedia } from "#web/queries/media";
import type { SeriesChoice } from "#web/utils/season-choice";
import SeriesRequestSheet from "./SeriesRequestSheet.vue";
import AppButton from "./ui/AppButton.vue";

const props = withDefaults(
  defineProps<{
    item: Pick<RequestInput, "mediaType" | "tmdbId" | "posterPath"> & { title: string };
    /** Already in the library: asking again is allowed, but say so. */
    held?: boolean;
    size?: "sm" | "md";
  }>(),
  { size: "md" },
);

const busy = ref(false);
const requested = ref(false);
const error = ref("");
const sheetOpen = ref(false);

// Requesting changes the library, so the mutation refreshes everything that
// shows it — the page this button sits on included.
const request = useRequestMedia();

/** A whole series is asked for season by season, so it asks which first. */
const choosesSeasons = computed(() => props.item.mediaType === "series");

const label = computed(() => {
  if (busy.value) return "Requesting…";
  return props.held ? "Request anyway" : "Request";
});

async function submit(input: RequestInput): Promise<boolean> {
  error.value = "";
  busy.value = true;
  try {
    await request.mutateAsync(input);
    requested.value = true;
    return true;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Could not request this";
    return false;
  } finally {
    busy.value = false;
  }
}

async function onRequest() {
  if (choosesSeasons.value) {
    error.value = "";
    sheetOpen.value = true;
    return;
  }
  const { mediaType, tmdbId, posterPath } = props.item;
  await submit({ mediaType, tmdbId, posterPath });
}

async function onChoose(choice: SeriesChoice) {
  const { mediaType, tmdbId, posterPath } = props.item;
  if (await submit({ mediaType, tmdbId, posterPath, ...choice })) sheetOpen.value = false;
}
</script>
