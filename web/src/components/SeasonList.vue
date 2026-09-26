<template>
  <AccordionRoot type="multiple" class="stagger flex flex-col gap-2">
    <AccordionItem
      v-for="season in seasons"
      :key="season.seasonNumber"
      :value="String(season.seasonNumber)"
      as-child
    >
      <AppCard :padded="false">
        <AccordionHeader as="h3" class="flex items-center gap-2 pr-3.5">
          <AccordionTrigger
            class="group flex min-w-0 flex-1 items-center gap-3 p-3.5 text-left transition-colors hover:bg-bg-elevated"
          >
            <div class="min-w-0 flex-1">
              <p class="text-sm font-semibold text-text-primary">
                {{ seasonName(season.seasonNumber) }}
              </p>
              <p class="mt-0.5 text-xs text-text-muted">
                {{ season.episodeFileCount }}/{{ season.episodeCount }} episodes
                <template v-if="season.sizeOnDisk > 0">
                  · {{ formatSize(season.sizeOnDisk) }}</template
                >
                <template v-if="season.requestedBy.length">
                  · {{ formatNames(season.requestedBy) }}</template
                >
                <template v-if="schedule(season)"> · {{ schedule(season) }}</template>
                <template v-else-if="season.detail"> · {{ season.detail }}</template>
              </p>
            </div>

            <StatusPill :tone="SEASON_STATES[season.state].tone">
              {{ SEASON_STATES[season.state].label }}
            </StatusPill>

            <!-- Rotates to point down while the season is open. -->
            <span
              class="shrink-0 text-text-muted transition-transform group-data-[state=open]:rotate-90"
              aria-hidden="true"
            >
              ›
            </span>
          </AccordionTrigger>

          <AppButton
            v-if="requestLabel(season)"
            variant="primary"
            size="sm"
            :loading="busy === scope(season.seasonNumber)"
            @click="onRequestSeason(season)"
          >
            {{ requestLabel(season) }}
          </AppButton>

          <AppButton
            v-if="canRelease(season)"
            variant="danger"
            size="sm"
            :loading="releasing === season.seasonNumber"
            @click="confirming = season"
          >
            Release
          </AppButton>
        </AccordionHeader>

        <DownloadProgress
          v-if="season.progress !== undefined"
          :progress="season.progress"
          :eta="season.eta"
          class="px-3.5 pb-3"
        />

        <p v-if="failed(season.seasonNumber)" class="px-3.5 pb-3 text-xs text-accent-red">
          {{ failed(season.seasonNumber) }}
        </p>

        <AccordionContent class="overflow-hidden">
          <ul class="border-t border-border-primary">
            <li
              v-for="episode in season.episodes"
              :key="episode.episodeNumber"
              class="flex items-center gap-3 px-3.5 py-2"
            >
              <span class="shrink-0 text-xs tabular-nums text-text-muted">
                {{ episodeCode(season.seasonNumber, episode.episodeNumber) }}
              </span>
              <span class="min-w-0 flex-1 truncate text-sm text-text-primary">
                {{ episode.title }}
              </span>
              <WatcherAvatars :watchers="episode.watchedBy" :max="3" class="shrink-0" />
              <span class="shrink-0 text-xs" :class="episodeClass(episode)">
                {{ episodeState(episode) }}
              </span>

              <!-- The rare single miss: the rest of the season came in, this did not. -->
              <AppButton
                v-if="missing(episode)"
                size="sm"
                :loading="busy === scope(season.seasonNumber, episode.episodeNumber)"
                @click="onRequestEpisode(season, episode)"
              >
                Request
              </AppButton>
            </li>

            <li v-if="!season.episodes.length" class="px-3.5 py-3 text-sm text-text-muted">
              Sonarr lists no episodes for this season yet.
            </li>
          </ul>
        </AccordionContent>
      </AppCard>
    </AccordionItem>

    <ConfirmDialog
      :open="confirming !== null"
      title="Release this season?"
      :description="releaseText"
      confirm-label="Release"
      busy-label="Releasing…"
      :busy="releasing !== null"
      @update:open="confirming = null"
      @confirm="onRelease"
    />
  </AccordionRoot>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import {
  AccordionContent,
  AccordionHeader,
  AccordionItem,
  AccordionRoot,
  AccordionTrigger,
} from "reka-ui";
import type { EpisodeSummary, SeasonState, SeasonSummary } from "#shared/types";
import { episodeCode, seasonName } from "#shared/media";
import { formatNames, formatSize } from "#web/utils/format";
import { SEASON_STATES } from "#web/utils/states";
import { useReleaseSeason, useRequestMedia } from "#web/queries/media";
import { useSession } from "#web/queries/session";
import DownloadProgress from "./DownloadProgress.vue";
import AppButton from "./ui/AppButton.vue";
import AppCard from "./ui/AppCard.vue";
import ConfirmDialog from "./ui/ConfirmDialog.vue";
import StatusPill from "./ui/StatusPill.vue";
import WatcherAvatars from "./WatcherAvatars.vue";

const props = defineProps<{
  seasons: SeasonSummary[];
  tmdbId: number;
  posterPath: string | null;
  /** Sonarr's id for the series, without which a season cannot be released. */
  serviceId?: number;
}>();

/** States where asking for more of this season is worth offering. */
const REQUESTABLE = new Set<SeasonState>([
  "unrequested",
  "unreleased",
  "searching",
  "stalled",
  "paused",
  "removed",
]);

const { isAdmin } = useSession();
const request = useRequestMedia();
const release = useReleaseSeason();

const busy = ref("");
const errors = ref(new Map<number, string>());
const confirming = ref<SeasonSummary | null>(null);
const releasing = ref<number | null>(null);

/** Which button is working, since every season has its own. */
function scope(seasonNumber: number, episodeNumber?: number): string {
  return episodeNumber === undefined ? `${seasonNumber}` : `${seasonNumber}:${episodeNumber}`;
}

/** Asking again for a season already asked for is a retry, and says so. */
function requestLabel(season: SeasonSummary): string {
  if (!REQUESTABLE.has(season.state)) return "";
  return season.requestedBy.length > 0 ? "Retry" : "Request";
}

/** "starts 12 Mar" before it begins, "next 12 Mar" once it is running. */
function schedule(season: SeasonSummary): string {
  if (!season.expectedAt) return "";
  const verb = season.state === "unreleased" ? "starts" : "next";
  return `${verb} ${airDate(season.expectedAt)}`;
}

function canRelease(season: SeasonSummary): boolean {
  return isAdmin.value && props.serviceId !== undefined && season.episodeFileCount > 0;
}

function failed(seasonNumber: number): string | undefined {
  return errors.value.get(seasonNumber);
}

function fail(seasonNumber: number, error: unknown, fallback: string): void {
  errors.value.set(seasonNumber, error instanceof Error ? error.message : fallback);
}

async function onRequestSeason(season: SeasonSummary): Promise<void> {
  errors.value.delete(season.seasonNumber);
  busy.value = scope(season.seasonNumber);
  try {
    await request.mutateAsync({
      mediaType: "series",
      tmdbId: props.tmdbId,
      posterPath: props.posterPath,
      seasonNumber: season.seasonNumber,
    });
  } catch (error) {
    fail(season.seasonNumber, error, "Could not request this season");
  } finally {
    busy.value = "";
  }
}

async function onRequestEpisode(season: SeasonSummary, episode: EpisodeSummary): Promise<void> {
  errors.value.delete(season.seasonNumber);
  busy.value = scope(season.seasonNumber, episode.episodeNumber);
  try {
    await request.mutateAsync({
      mediaType: "series",
      tmdbId: props.tmdbId,
      posterPath: props.posterPath,
      seasonNumber: season.seasonNumber,
      episodeNumber: episode.episodeNumber,
    });
  } catch (error) {
    fail(season.seasonNumber, error, "Could not request this episode");
  } finally {
    busy.value = "";
  }
}

const releaseText = computed(() => {
  const season = confirming.value;
  if (!season) return "";
  const size = season.sizeOnDisk > 0 ? ` and frees ${formatSize(season.sizeOnDisk)}` : "";
  return `This deletes ${seasonName(season.seasonNumber).toLowerCase()}${size}. The rest of the series stays.`;
});

async function onRelease(): Promise<void> {
  const season = confirming.value;
  if (!season || props.serviceId === undefined) return;

  errors.value.delete(season.seasonNumber);
  confirming.value = null;
  releasing.value = season.seasonNumber;
  try {
    await release.mutateAsync({
      serviceId: props.serviceId,
      seasonNumber: season.seasonNumber,
    });
  } catch (error) {
    fail(season.seasonNumber, error, "Could not release this season");
  } finally {
    releasing.value = null;
  }
}

/** An episode that has not aired is not missing, it is simply not here yet. */
function unaired(episode: EpisodeSummary): boolean {
  return !episode.hasFile && !!episode.airDate && new Date(episode.airDate) > new Date();
}

function missing(episode: EpisodeSummary): boolean {
  return !episode.hasFile && !unaired(episode);
}

function episodeState(episode: EpisodeSummary): string {
  if (episode.hasFile) return "On disk";
  if (unaired(episode)) return airDate(episode.airDate);
  return "Missing";
}

function episodeClass(episode: EpisodeSummary): string {
  if (episode.hasFile) return "text-accent-green";
  return unaired(episode) ? "text-text-muted" : "text-accent-red";
}

/** "12 Mar" — the year only matters when it is not this one. */
function airDate(date?: string): string {
  if (!date) return "Unaired";
  const at = new Date(date);
  const year = at.getFullYear() === new Date().getFullYear() ? undefined : "numeric";
  return at.toLocaleDateString(undefined, { day: "numeric", month: "short", year });
}
</script>
