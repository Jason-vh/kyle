<template>
  <AppCard :padded="false" class="p-4">
    <div class="flex items-center gap-2.5">
      <span class="size-2 shrink-0 rounded-full" :class="dotClass" aria-hidden="true" />
      <h2 class="text-base font-semibold text-text-primary">{{ label }}</h2>
      <span v-if="when" class="ml-auto shrink-0 text-xs text-text-muted">{{ when }}</span>
    </div>

    <p v-if="reason" class="mt-1.5 text-sm text-text-secondary">{{ reason }}</p>

    <ReleaseTimeline v-if="timeline" :releases="timeline" class="mt-4" />

    <div
      v-if="progress !== undefined"
      class="mt-3.5 h-1.5 overflow-hidden rounded-full bg-bg-elevated"
      role="progressbar"
      :aria-valuenow="Math.round(progress * 100)"
      aria-valuemin="0"
      aria-valuemax="100"
    >
      <!-- A sliver at 0% still reads as started, where nothing reads as broken. -->
      <div
        class="h-full rounded-full transition-[width]"
        :class="state === 'stalled' ? 'bg-text-muted' : 'bg-text-primary'"
        :style="{ width: `${Math.max(2, Math.round(progress * 100))}%` }"
      />
    </div>

    <div v-if="hasActions" class="mt-4 flex gap-2">
      <RequestAction v-if="requestable" :item="media" block class="flex-1" />

      <AppButton
        v-if="action"
        :variant="action.variant"
        :loading="busy"
        :disabled="done"
        class="flex-1"
        @click="run"
      >
        {{ done && action.done ? action.done : action.label }}
      </AppButton>
    </div>

    <p v-if="error" class="mt-2 text-xs text-accent-red">{{ error }}</p>
  </AppCard>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { MediaDetail, MovieReleases, RequestState } from "#shared/types";
import { REQUEST_STATES } from "#web/utils/states";
import { formatDate, formatEta, formatSize } from "#web/utils/format";
import { relativeOrDate } from "#web/composables/useRelativeTime";
import { useReportRequest, useRetryRequest } from "#web/queries/media";
import { useSession } from "#web/queries/session";
import ReleaseTimeline from "./ReleaseTimeline.vue";
import RequestAction from "./RequestAction.vue";
import AppButton from "./ui/AppButton.vue";
import AppCard from "./ui/AppCard.vue";

const props = defineProps<{ media: MediaDetail }>();

const emit = defineEmits<{ refresh: [] }>();

const { isAdmin } = useSession();

/** Never held, which no request state covers. */
type CardState = RequestState | "absent";

const state = computed<CardState>(() => props.media.status?.state ?? "absent");

const serviceName = computed(() => (props.media.mediaType === "movie" ? "Radarr" : "Sonarr"));

const label = computed(() => {
  if (state.value === "absent") return "Not in the library";
  if (state.value === "unknown") return `${serviceName.value} isn't responding`;
  return REQUEST_STATES[state.value].label;
});

/** Colour is kept for what is done, what needs a look, and what failed; the rest waits in grey. */
const DOTS: Partial<Record<CardState, string>> = {
  ready: "bg-accent-green",
  stalled: "bg-accent-amber",
  blocked: "bg-accent-red",
};

/** States where something is happening right now, which the dot says by breathing. */
const MOVING = new Set<CardState>(["searching", "found", "downloading", "importing"]);

const dotClass = computed(() => [
  DOTS[state.value] ?? "bg-text-muted",
  MOVING.has(state.value) ? "animate-pulse" : "",
]);

const missingEpisodes = computed(() =>
  (props.media.status?.missing ?? []).reduce((total, season) => total + season.episodes, 0),
);

function readyFacts(): string {
  if (props.media.mediaType === "series") {
    return missingEpisodes.value > 0 ? `${missingEpisodes.value} missing` : "";
  }
  const size = props.media.library?.sizeOnDisk ?? 0;
  const facts = [props.media.quality, size > 0 ? formatSize(size) : undefined];
  return facts.filter(Boolean).join(" · ");
}

function timeLeft(): string {
  const left = formatEta(props.media.eta ?? "");
  return left ? `${left} left` : "";
}

/** The one fact that goes with the state, right-aligned beside it. */
const when = computed(() => {
  const { since, expectedAt } = props.media.status ?? {};
  switch (state.value) {
    case "ready":
      return readyFacts();
    case "downloading":
      return timeLeft();
    case "searching":
      return since ? `searched ${relativeOrDate(since)}` : "";
    case "stalled":
      return since ? `since ${relativeOrDate(since)}` : "";
    case "found":
    case "blocked":
    case "importing":
      return since ? relativeOrDate(since) : "";
    case "removed":
      return since ? formatDate(since) : "";
    case "unreleased":
      return timeline.value || !expectedAt ? "" : `starts ${formatDate(expectedAt)}`;
    default:
      return "";
  }
});

const reason = computed(() => {
  if (state.value === "searching") return "No copy available yet.";
  if (state.value === "found") return "Starting the download.";
  if (state.value === "removed") return props.media.status?.detail;
  return undefined;
});

/** A movie not out at home yet shows where it has got to instead of saying so. */
const timeline = computed<MovieReleases | undefined>(() => {
  if (props.media.mediaType !== "movie") return undefined;
  if (state.value !== "unreleased" && state.value !== "waiting") return undefined;
  return props.media.releases;
});

const progress = computed(() => {
  if (state.value !== "downloading" && state.value !== "stalled") return undefined;
  return props.media.progress;
});

const requestable = computed(() => state.value === "absent" || state.value === "removed");

interface Action {
  label: string;
  /** What the button says once pressed; absent for one worth pressing again. */
  done?: string;
  variant: "primary" | "secondary";
  run: () => Promise<unknown>;
}

const retry = useRetryRequest();
const report = useReportRequest();

const target = computed(() => ({ mediaType: props.media.mediaType, tmdbId: props.media.tmdbId }));

/** The one thing worth doing about the state, beyond requesting or playing it. */
const action = computed<Action | undefined>(() => {
  switch (state.value) {
    case "searching":
      return {
        label: "Search again",
        done: "Searching…",
        variant: "secondary",
        run: () => retry.mutateAsync(target.value),
      };
    case "stalled":
      return {
        label: "Try another copy",
        done: "Searching…",
        variant: "primary",
        run: () => retry.mutateAsync(target.value),
      };
    case "blocked":
      if (isAdmin.value) return undefined;
      return {
        label: "Tell an admin",
        done: "Reported",
        variant: "primary",
        run: () => report.mutateAsync(target.value),
      };
    case "ready":
      if (missingEpisodes.value === 0) return undefined;
      return {
        label: "Find missing",
        done: "Searching…",
        variant: "secondary",
        run: () => retry.mutateAsync(target.value),
      };
    case "unknown":
      return {
        label: "Try again",
        variant: "secondary",
        run: async () => emit("refresh"),
      };
    default:
      return undefined;
  }
});

const hasActions = computed(() => requestable.value || !!action.value);

const busy = ref(false);
const done = ref(false);
const error = ref("");

// A new state is a new question, so an earlier answer no longer holds.
watch(state, () => {
  done.value = false;
  error.value = "";
});

async function run() {
  if (!action.value) return;

  error.value = "";
  busy.value = true;
  try {
    await action.value.run();
    done.value = !!action.value.done;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "That did not work";
  } finally {
    busy.value = false;
  }
}
</script>
