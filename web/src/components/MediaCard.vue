<template>
  <AppCard>
    <div class="flex gap-3">
      <MediaPoster :src="poster" :alt="item.title" size="lg" />

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
          <StatusPill v-if="item.libraryStatus === 'available'" tone="green">Available</StatusPill>
          <StatusPill v-else-if="item.libraryStatus === 'pending'" tone="amber">
            Downloading
          </StatusPill>

          <AppButton
            v-if="!requested"
            variant="primary"
            size="sm"
            class="ml-auto"
            :loading="busy"
            @click="onRequest"
          >
            {{ busy ? "Requesting…" : item.libraryStatus ? "Request anyway" : "Request" }}
          </AppButton>

          <span v-else class="ml-auto text-xs font-semibold text-accent-green">Requested</span>
        </div>

        <p v-if="error" class="mt-1 text-xs text-accent-red">{{ error }}</p>
      </div>
    </div>
  </AppCard>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { posterUrl, type DiscoverResult } from "#web/api/requests";
import { useRequestMedia } from "#web/queries/media";
import { formatNames } from "#web/utils/format";
import AppButton from "./ui/AppButton.vue";
import AppCard from "./ui/AppCard.vue";
import MediaPoster from "./ui/MediaPoster.vue";
import StatusPill from "./ui/StatusPill.vue";

const props = defineProps<{ item: DiscoverResult }>();

const busy = ref(false);
const requested = ref(false);
const error = ref("");

const poster = computed(() => posterUrl(props.item.posterPath));

// Requesting changes the library, so the mutation refreshes everything that
// shows it — this card's own search results included.
const request = useRequestMedia();

async function onRequest() {
  error.value = "";
  busy.value = true;
  try {
    await request.mutateAsync(props.item);
    requested.value = true;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Could not request this";
  } finally {
    busy.value = false;
  }
}
</script>
