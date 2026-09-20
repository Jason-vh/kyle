<template>
  <AppCard interactive class="relative">
    <div class="flex items-center gap-3">
      <MediaPoster :src="posterUrl(request.posterPath)" :alt="request.title" />

      <div class="min-w-0 flex-1">
        <div class="flex items-baseline gap-2">
          <MediaTitle
            :media-type="request.mediaType"
            :tmdb-id="request.tmdbId"
            :title="request.title"
          />
          <span v-if="request.year" class="shrink-0 text-xs text-text-muted">
            {{ request.year }}
          </span>
        </div>

        <p class="mt-0.5 truncate text-xs text-text-muted">
          {{ request.mediaType === "movie" ? "Movie" : "Series" }}
          <template v-if="request.requestedBy"> · {{ request.requestedBy }}</template>
          · {{ relativeTime(request.createdAt) }}
        </p>

        <p v-if="explanation" class="mt-0.5 truncate text-xs text-text-secondary">
          {{ explanation }}
        </p>

        <DownloadProgress
          v-if="request.progress !== undefined"
          :progress="request.progress"
          :eta="request.eta"
          class="mt-1.5"
        />
      </div>

      <div class="flex shrink-0 flex-col items-end gap-1.5">
        <StatusPill :tone="STATES[request.state].tone">
          {{ STATES[request.state].label }}
        </StatusPill>
        <RequestActions :request="request" />
      </div>
    </div>
  </AppCard>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { MediaRequest, MissingSeason, RequestState } from "#web/api/requests";
import { posterUrl } from "#web/utils/images";
import { formatDate } from "#web/utils/format";
import { relativeTime } from "#web/composables/useRelativeTime";
import DownloadProgress from "./DownloadProgress.vue";
import RequestActions from "./RequestActions.vue";
import MediaTitle from "./MediaTitle.vue";
import AppCard from "./ui/AppCard.vue";
import MediaPoster from "./ui/MediaPoster.vue";
import StatusPill from "./ui/StatusPill.vue";
import type { Tone } from "./ui/types";

/** The one place a request's state is put into words. */
const STATES: Record<RequestState, { label: string; tone: Tone }> = {
  unreleased: { label: "Not out yet", tone: "neutral" },
  waiting: { label: "In cinemas", tone: "neutral" },
  searching: { label: "Looking", tone: "blue" },
  found: { label: "Found one", tone: "blue" },
  downloading: { label: "Downloading", tone: "amber" },
  stalled: { label: "Stalled", tone: "amber" },
  blocked: { label: "Can't import", tone: "red" },
  importing: { label: "Almost there", tone: "amber" },
  ready: { label: "Ready", tone: "green" },
  paused: { label: "Paused", tone: "neutral" },
  removed: { label: "Gone", tone: "neutral" },
};

const props = defineProps<{ request: MediaRequest }>();

/** "Season 4 · 2 episodes missing", "3 seasons · 12 episodes missing". */
function describeMissing(missing: MissingSeason[]): string {
  const episodes = missing.reduce((total, season) => total + season.episodes, 0);
  const plural = episodes === 1 ? "episode" : "episodes";

  if (missing.length === 1) return `Season ${missing[0]!.season} · ${episodes} ${plural} missing`;
  return `${missing.length} seasons · ${episodes} ${plural} missing`;
}

/** States whose age is worth saying: something has been stuck that long. */
const TIMED = new Set<RequestState>(["found", "stalled", "blocked", "importing"]);

/** What the state means for the person who asked, in one line. */
function explain(request: MediaRequest): string | undefined {
  const { state, detail, expectedAt, missing, since } = request;

  if (state === "ready") return missing?.length ? describeMissing(missing) : undefined;

  if (state === "unreleased") {
    return expectedAt ? `Not out until ${formatDate(expectedAt)}` : "No release date yet";
  }
  if (state === "waiting") {
    return expectedAt ? `Digital release ${formatDate(expectedAt)}` : "In cinemas only for now";
  }
  if (state === "searching") {
    if (detail) return detail;
    return since ? `Nothing found — last tried ${relativeTime(since)}` : "Searching for a release";
  }
  if (state === "found") return detail ?? "Found a release, starting shortly";
  if (state === "stalled") return detail ?? "No seeders — it will be retried";
  if (state === "blocked") return detail ?? "Downloaded, but it could not be imported";
  if (state === "importing") return "Downloaded — adding it to Plex";
  if (state === "paused") return "Nobody is looking for this";
  if (state === "removed") return "No longer in the library";

  return undefined;
}

const explanation = computed(() => {
  const line = explain(props.request);
  if (!line || !props.request.since || !TIMED.has(props.request.state)) return line;
  return `${line} · ${relativeTime(props.request.since)}`;
});
</script>
