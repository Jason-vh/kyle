<template>
  <div class="flex gap-3 rounded-lg border border-border-primary bg-bg-surface p-3">
    <div
      class="h-[108px] w-[72px] shrink-0 overflow-hidden rounded-md bg-bg-input"
      :title="item.title"
    >
      <img
        v-if="poster"
        :src="poster"
        :alt="item.title"
        loading="lazy"
        class="size-full object-cover"
      />
      <div v-else class="flex size-full items-center justify-center text-xs text-text-muted">
        No art
      </div>
    </div>

    <div class="flex min-w-0 flex-1 flex-col">
      <div class="flex items-baseline gap-2">
        <h3 class="truncate text-sm font-semibold text-text-primary">{{ item.title }}</h3>
        <span v-if="item.year" class="shrink-0 text-xs text-text-muted">{{ item.year }}</span>
      </div>

      <p class="mt-0.5 text-xs text-text-muted">
        {{ item.mediaType === "movie" ? "Movie" : "Series" }}
      </p>

      <p v-if="item.overview" class="mt-1 line-clamp-2 text-xs text-text-muted">
        {{ item.overview }}
      </p>

      <p v-if="item.requestedBy.length" class="mt-1 truncate text-xs text-text-muted">
        Requested by {{ formatNames(item.requestedBy) }}
      </p>

      <div class="mt-auto flex items-center gap-2 pt-2">
        <span
          v-if="item.libraryStatus === 'available'"
          class="rounded-full bg-accent-green-light px-2 py-0.5 text-xs font-semibold text-accent-green"
        >
          Available
        </span>
        <span
          v-else-if="item.libraryStatus === 'pending'"
          class="rounded-full bg-accent-amber-light px-2 py-0.5 text-xs font-semibold text-accent-amber"
        >
          Downloading
        </span>

        <button
          v-if="!requested"
          :disabled="busy"
          class="ml-auto rounded-lg bg-accent-purple px-3 py-1.5 text-xs font-semibold text-text-inverse transition-colors hover:bg-accent-purple/90 disabled:opacity-50"
          @click="onRequest"
        >
          {{ busy ? "Requesting…" : item.libraryStatus ? "Request anyway" : "Request" }}
        </button>
        <span v-else class="ml-auto text-xs font-semibold text-accent-green">Requested</span>
      </div>

      <p v-if="error" class="mt-1 text-xs text-accent-red">{{ error }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { posterUrl, requestMedia, type DiscoverResult } from "../api/requests";

const props = defineProps<{ item: DiscoverResult }>();

const busy = ref(false);
const requested = ref(false);
const error = ref("");

const poster = computed(() => posterUrl(props.item.posterPath));

/** "Bob", "Bob and Jane", "Bob, Jane, and Sue". */
function formatNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

async function onRequest() {
  error.value = "";
  busy.value = true;
  try {
    await requestMedia(props.item);
    requested.value = true;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Could not request this";
  } finally {
    busy.value = false;
  }
}
</script>
