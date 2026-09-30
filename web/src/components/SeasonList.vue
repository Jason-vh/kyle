<template>
  <AccordionRoot type="multiple" class="stagger flex flex-col gap-2">
    <AccordionItem
      v-for="season in seasons"
      :key="season.seasonNumber"
      :value="String(season.seasonNumber)"
      as-child
    >
      <AppCard :padded="false" class="group">
        <!-- Held down, the season offers its menu, as the ⋯ button does. -->
        <AccordionHeader
          v-long-press="() => openMenu(season)"
          as="div"
          class="relative p-3.5 select-none [-webkit-touch-callout:none]"
        >
          <div class="flex items-center gap-2">
            <!-- Stretched over the header, so a tap anywhere but a button opens the season. -->
            <AccordionTrigger
              class="min-w-0 flex-1 text-left after:absolute after:inset-0 after:rounded-card focus:outline-none focus-visible:after:ring-2 focus-visible:after:ring-accent/40"
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
              v-if="actionsFor(season).length"
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

        <p v-if="reason(season)" class="px-3.5 pb-3 text-xs text-text-secondary">
          {{ reason(season) }}
        </p>

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
              <span v-if="lastWatched(episode)" class="shrink-0 text-xs text-text-muted">
                {{ lastWatched(episode) }}
              </span>

              <span
                v-if="episode.hasFile"
                role="img"
                aria-label="Downloaded"
                class="size-1.5 shrink-0 rounded-full bg-accent-green"
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
      :actions="menuFor ? actionsFor(menuFor) : []"
      @update:open="menuFor = null"
    />

    <ConfirmDialog
      :open="confirming !== null"
      title="Delete this season?"
      :description="releaseText"
      confirm-label="Delete"
      :busy="releasing !== null"
      :error="releaseError"
      @update:open="closeRelease"
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
import { formatDate, formatEta, formatSize } from "#web/utils/format";
import { SEASON_STATES } from "#web/utils/states";
import {
  useMonitorSeason,
  useReleaseSeason,
  useRequestMedia,
  useRetryRequest,
} from "#web/queries/media";
import { useSession } from "#web/queries/session";
import { vLongPress } from "#web/directives/longPress";
import EpisodeBar from "./EpisodeBar.vue";
import type { MenuAction } from "./menu";
import MediaMenu from "./MediaMenu.vue";
import AppButton from "./ui/AppButton.vue";
import AppCard from "./ui/AppCard.vue";
import ConfirmDialog from "./ui/ConfirmDialog.vue";
import { unaired } from "#web/utils/episodes";
import { daysAgo } from "#web/utils/library";
import { lastWatch } from "#web/utils/watch";
import IconCaret from "~icons/ph/caret-down-bold";
import IconMore from "~icons/ph/dots-three-bold";
import IconMonitor from "~icons/ph/eye";
import IconUnmonitor from "~icons/ph/eye-slash";
import IconSearch from "~icons/ph/arrow-clockwise";
import IconTrash from "~icons/ph/trash";

const props = defineProps<{
  seasons: SeasonSummary[];
  tmdbId: number;
  posterPath: string | null;
  /** Sonarr's id for the series, without which a season cannot be changed. */
  serviceId?: number;
  /** An admin, or whoever asked for the series, and so may say what it keeps looking for. */
  canManage?: boolean;
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
const monitor = useMonitorSeason();

const busy = ref("");
const errors = ref(new Map<number, string>());
const menuFor = ref<SeasonSummary | null>(null);
const confirming = ref<SeasonSummary | null>(null);
const releasing = ref<number | null>(null);
const releaseError = ref("");

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
  parts.push(...downloadFacts(season));
  return parts.join(" · ");
}

function downloadFacts(season: SeasonSummary): string[] {
  if (season.state !== "downloading" && season.state !== "stalled") return [];

  const facts: string[] = [];
  if (season.progress !== undefined) facts.push(`${Math.round(season.progress * 100)}%`);

  const left = formatEta(season.eta ?? "");
  if (left && season.state === "downloading") facts.push(`${left} left`);
  return facts;
}

function reason(season: SeasonSummary): string | undefined {
  if (!ATTENTION[season.state]) return undefined;
  return season.detail;
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

/** Monitoring can be switched off, and back on for a season nobody would request again. */
function monitoringAction(season: SeasonSummary): MenuAction | undefined {
  const serviceId = props.serviceId;
  if (!props.canManage || serviceId === undefined) return undefined;

  const change = (monitored: boolean) => () =>
    monitor.mutateAsync({ serviceId, seasonNumber: season.seasonNumber, monitored });

  if (season.monitored) {
    return {
      label: "Stop monitoring",
      hint: "Keeps what is downloaded",
      icon: IconUnmonitor,
      run: change(false),
    };
  }
  if (requestable(season)) return undefined;
  return { label: "Start monitoring", icon: IconMonitor, run: change(true) };
}

function actionsFor(season: SeasonSummary): MenuAction[] {
  const actions: MenuAction[] = [];
  if (searchable(season)) {
    actions.push({
      label: season.state === "stalled" ? "Try another copy" : "Search again",
      icon: IconSearch,
      run: () =>
        retry.mutateAsync({
          mediaType: "series",
          tmdbId: props.tmdbId,
          seasonNumber: season.seasonNumber,
        }),
    });
  }

  const monitoring = monitoringAction(season);
  if (monitoring) actions.push(monitoring);

  if (canRelease(season)) {
    actions.push({
      label: "Delete season",
      hint: season.sizeOnDisk > 0 ? `Frees ${formatSize(season.sizeOnDisk)}` : undefined,
      icon: IconTrash,
      danger: true,
      run: () => {
        confirming.value = season;
      },
    });
  }
  return actions;
}

function openMenu(season: SeasonSummary) {
  if (actionsFor(season).length) menuFor.value = season;
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

  releaseError.value = "";
  releasing.value = season.seasonNumber;
  try {
    await release.mutateAsync({
      serviceId: props.serviceId,
      seasonNumber: season.seasonNumber,
    });
    confirming.value = null;
  } catch (error) {
    releaseError.value = error instanceof Error ? error.message : "Could not delete this season";
  } finally {
    releasing.value = null;
  }
}

function closeRelease(): void {
  confirming.value = null;
  releaseError.value = "";
}

function lastWatched(episode: EpisodeSummary): string | undefined {
  if (!episode.hasFile) return undefined;
  const latest = lastWatch(episode.watchedBy);
  if (!latest) return undefined;
  return `watched ${daysAgo(latest.watchedAt)}`;
}

function airDate(date?: string): string {
  if (!date) return "Unaired";
  return formatDate(date);
}
</script>
