<template>
  <AccordionRoot type="multiple" class="stagger flex flex-col gap-2">
    <AccordionItem
      v-for="season in seasons"
      :key="season.seasonNumber"
      :value="String(season.seasonNumber)"
      as-child
    >
      <AppCard :padded="false" class="group">
        <AccordionHeader as="div" class="relative p-3.5">
          <div class="flex items-center gap-2">
            <!-- Stretched over the header, so a tap anywhere but a button opens the season. -->
            <AccordionTrigger
              class="min-w-0 flex-1 text-left after:absolute after:inset-0 after:rounded-card focus:outline-none focus-visible:after:ring-2 focus-visible:after:ring-accent-purple/40"
            >
              <span class="block text-sm font-semibold text-text-primary">
                {{ seasonName(season.seasonNumber) }}
              </span>
              <span class="flex items-center gap-1.5 text-xs text-text-muted">
                <span
                  v-if="ATTENTION[season.state]"
                  class="size-1.5 shrink-0 rounded-full"
                  :class="ATTENTION[season.state]"
                  aria-hidden="true"
                />
                {{ summary(season) }}
              </span>
            </AccordionTrigger>

            <AppButton
              v-if="requestable(season)"
              variant="primary"
              size="sm"
              class="relative"
              :loading="busy === scope(season.seasonNumber)"
              @click="onRequestSeason(season)"
            >
              Request
            </AppButton>

            <AppButton
              v-if="hasMenu(season)"
              variant="ghost"
              size="sm"
              class="relative size-8 px-0"
              :aria-label="`${seasonName(season.seasonNumber)} options`"
              @click="menuFor = season"
            >
              <IconMore class="size-4.5" aria-hidden="true" />
            </AppButton>

            <IconCaret
              class="size-4 shrink-0 text-text-muted transition-transform group-data-[state=open]:rotate-180"
              aria-hidden="true"
            />
          </div>

          <EpisodeBar v-if="showsBar(season)" :season="season" class="mt-2.5" />
        </AccordionHeader>

        <p v-if="failed(season.seasonNumber)" class="px-3.5 pb-3 text-xs text-accent-red">
          {{ failed(season.seasonNumber) }}
        </p>

        <AccordionContent class="overflow-hidden">
          <ul class="border-t border-border-primary py-1">
            <li
              v-for="episode in season.episodes"
              :key="episode.episodeNumber"
              class="flex min-h-10 items-center gap-3 px-3.5 py-1.5"
            >
              <span class="w-5 shrink-0 text-right text-xs tabular-nums text-text-muted">
                {{ episode.episodeNumber }}
              </span>
              <span
                class="min-w-0 flex-1 truncate text-sm"
                :class="episode.hasFile ? 'text-text-primary' : 'text-text-secondary'"
              >
                {{ episode.title }}
              </span>
              <WatcherAvatars :watchers="episode.watchedBy" :max="3" class="shrink-0" />

              <IconCheck
                v-if="episode.hasFile"
                class="size-4 shrink-0 text-text-muted"
                role="img"
                aria-label="On disk"
              />
              <span v-else-if="unaired(episode)" class="shrink-0 text-xs text-text-muted">
                {{ airDate(episode.airDate) }}
              </span>
              <AppButton
                v-else-if="!episode.monitored"
                size="sm"
                :loading="busy === scope(season.seasonNumber, episode.episodeNumber)"
                @click="onRequestEpisode(season, episode)"
              >
                Request
              </AppButton>
              <span v-else class="shrink-0 text-xs font-medium text-text-primary">Missing</span>
            </li>

            <li v-if="!season.episodes.length" class="px-3.5 py-2 text-sm text-text-muted">
              No episodes listed yet.
            </li>
          </ul>
        </AccordionContent>
      </AppCard>
    </AccordionItem>

    <MediaMenu
      :open="menuFor !== null"
      :title="menuFor ? seasonName(menuFor.seasonNumber) : ''"
      :search="menuSearch"
      :removal="menuFor ? removal(menuFor) : undefined"
      @update:open="menuFor = null"
      @remove="confirming = menuFor"
    />

    <ConfirmDialog
      :open="confirming !== null"
      title="Delete this season?"
      :description="releaseText"
      confirm-label="Delete"
      busy-label="Deleting…"
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
import { seasonName } from "#shared/media";
import { formatDate, formatSize } from "#web/utils/format";
import { SEASON_STATES } from "#web/utils/states";
import { useReleaseSeason, useRequestMedia, useRetryRequest } from "#web/queries/media";
import { useSession } from "#web/queries/session";
import EpisodeBar from "./EpisodeBar.vue";
import MediaMenu from "./MediaMenu.vue";
import AppButton from "./ui/AppButton.vue";
import AppCard from "./ui/AppCard.vue";
import ConfirmDialog from "./ui/ConfirmDialog.vue";
import WatcherAvatars from "./WatcherAvatars.vue";
import { unaired } from "#web/utils/episodes";
import IconCaret from "~icons/ph/caret-down-bold";
import IconCheck from "~icons/ph/check-bold";
import IconMore from "~icons/ph/dots-three-bold";

const props = defineProps<{
  seasons: SeasonSummary[];
  tmdbId: number;
  posterPath: string | null;
  /** Sonarr's id for the series, without which a season cannot be deleted. */
  serviceId?: number;
}>();

/** Only what needs a look gets colour; everything else is said in words. */
const ATTENTION: Partial<Record<SeasonState, string>> = {
  stalled: "bg-accent-amber",
  blocked: "bg-accent-red",
};

/** States that say more than the episode count already does. */
const QUIET = new Set<SeasonState>(["ready", "airing"]);

const { isAdmin } = useSession();
const request = useRequestMedia();
const retry = useRetryRequest();
const release = useReleaseSeason();

const busy = ref("");
const errors = ref(new Map<number, string>());
const menuFor = ref<SeasonSummary | null>(null);
const confirming = ref<SeasonSummary | null>(null);
const releasing = ref<number | null>(null);

/** Which button is working, since every season has its own. */
function scope(seasonNumber: number, episodeNumber?: number): string {
  return episodeNumber === undefined ? `${seasonNumber}` : `${seasonNumber}:${episodeNumber}`;
}

/** "3 of 8 · Downloading", "Not requested", "4 of 10 · next 12 Mar". */
function summary(season: SeasonSummary): string {
  if (season.state === "unrequested") return SEASON_STATES.unrequested.label;
  if (season.state === "unreleased") {
    return season.expectedAt ? `Starts ${airDate(season.expectedAt)}` : "Not aired yet";
  }

  const parts: string[] = [];
  if (season.episodeCount > 0) parts.push(`${season.episodeFileCount} of ${season.episodeCount}`);
  if (season.state === "airing" && season.expectedAt) {
    parts.push(`next ${airDate(season.expectedAt)}`);
  }
  if (!QUIET.has(season.state)) parts.push(SEASON_STATES[season.state].label);
  return parts.join(" · ");
}

function showsBar(season: SeasonSummary): boolean {
  return season.episodes.length > 0 && season.state !== "unrequested";
}

/** Nobody is after this season, so asking is the thing to do. */
function requestable(season: SeasonSummary): boolean {
  return season.state === "unrequested" || season.state === "removed";
}

/** Something in the season is still wanted and not here. */
function searchable(season: SeasonSummary): boolean {
  if (!season.monitored || requestable(season)) return false;
  return season.episodeFileCount < season.episodeCount;
}

function canRelease(season: SeasonSummary): boolean {
  return isAdmin.value && props.serviceId !== undefined && season.episodeFileCount > 0;
}

function hasMenu(season: SeasonSummary): boolean {
  return searchable(season) || canRelease(season);
}

function removal(season: SeasonSummary): { label: string; hint?: string } | undefined {
  if (!canRelease(season)) return undefined;
  const hint = season.sizeOnDisk > 0 ? `Frees ${formatSize(season.sizeOnDisk)}` : undefined;
  return { label: "Delete season", hint };
}

function failed(seasonNumber: number): string | undefined {
  return errors.value.get(seasonNumber);
}

function fail(seasonNumber: number, error: unknown, fallback: string): void {
  errors.value.set(seasonNumber, error instanceof Error ? error.message : fallback);
}

/** Looks again for whatever the open menu's season is still short of. */
const menuSearch = computed(() => {
  const season = menuFor.value;
  if (!season || !searchable(season)) return undefined;
  return () =>
    retry.mutateAsync({
      mediaType: "series",
      tmdbId: props.tmdbId,
      seasonNumber: season.seasonNumber,
    });
});

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
    fail(season.seasonNumber, error, "Could not delete this season");
  } finally {
    releasing.value = null;
  }
}

function airDate(date?: string): string {
  if (!date) return "Unaired";
  return formatDate(date);
}
</script>
