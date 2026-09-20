<template>
  <AppButton variant="ghost" size="sm" :loading="busy" @click="onRetry">{{ label }}</AppButton>
  <p v-if="error" class="mt-1 text-xs text-accent-red">{{ error }}</p>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import type { MediaRequest } from "#web/api/requests";
import { useRetryRequest } from "#web/queries/media";
import AppButton from "./ui/AppButton.vue";

const props = defineProps<{ request: MediaRequest }>();

const busy = ref(false);
const done = ref(false);
const error = ref("");

const retry = useRetryRequest();

/** A stall is given up on rather than searched again, so say which it is. */
const label = computed(() => {
  if (done.value) return "Looking…";
  if (props.request.state === "stalled") return "Try another";
  return "Search again";
});

async function onRetry() {
  error.value = "";
  busy.value = true;
  try {
    await retry.mutateAsync({ mediaType: props.request.mediaType, tmdbId: props.request.tmdbId });
    done.value = true;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Could not search again";
  } finally {
    busy.value = false;
  }
}
</script>
