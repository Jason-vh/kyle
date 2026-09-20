<template>
  <template v-if="action">
    <AppButton variant="ghost" size="sm" :loading="busy" :disabled="done" @click="run">
      {{ done ? action.done : action.label }}
    </AppButton>
    <p v-if="error" class="text-xs text-accent-red">{{ error }}</p>
  </template>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import type { MediaRequest, RequestState } from "#web/api/requests";
import { useReportRequest, useRequestMedia, useRetryRequest } from "#web/queries/media";
import AppButton from "./ui/AppButton.vue";

interface Action {
  label: string;
  /** What the button says once it has been pressed. */
  done: string;
  run: () => Promise<unknown>;
}

const props = defineProps<{ request: MediaRequest }>();

const busy = ref(false);
const done = ref(false);
const error = ref("");

const retry = useRetryRequest();
const report = useReportRequest();
const request = useRequestMedia();

/** The one thing worth doing about each state; the rest wait on time. */
const ACTIONS: Partial<Record<RequestState, Omit<Action, "run"> & { kind: string }>> = {
  searching: { kind: "retry", label: "Search again", done: "Looking…" },
  stalled: { kind: "retry", label: "Try another", done: "Looking…" },
  blocked: { kind: "report", label: "Tell an admin", done: "Reported" },
  removed: { kind: "request", label: "Request again", done: "Requested" },
};

const action = computed<Action | undefined>(() => {
  const entry = ACTIONS[props.request.state];
  if (!entry) return undefined;

  // Whatever is pressed acts on what was asked for, which may be one season.
  const { mediaType, tmdbId, posterPath, seasonNumber } = props.request;
  const scoped = { mediaType, tmdbId, seasonNumber };
  const runners: Record<string, () => Promise<unknown>> = {
    retry: () => retry.mutateAsync(scoped),
    report: () => report.mutateAsync(scoped),
    request: () =>
      request.mutateAsync({
        mediaType,
        tmdbId,
        posterPath,
        seasonNumber: seasonNumber ?? undefined,
      }),
  };

  return { label: entry.label, done: entry.done, run: runners[entry.kind]! };
});

async function run() {
  if (!action.value) return;

  error.value = "";
  busy.value = true;
  try {
    await action.value.run();
    done.value = true;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "That did not work";
  } finally {
    busy.value = false;
  }
}
</script>
