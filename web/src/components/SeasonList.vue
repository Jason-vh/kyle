<template>
  <AccordionRoot type="multiple" class="stagger flex flex-col gap-2">
    <AccordionItem
      v-for="season in seasons"
      :key="season.seasonNumber"
      :value="String(season.seasonNumber)"
      as-child
    >
      <AppCard :padded="false">
        <AccordionHeader as="h3">
          <AccordionTrigger
            class="group flex w-full items-center gap-3 p-3.5 text-left transition-colors hover:bg-bg-elevated"
          >
            <div class="min-w-0 flex-1">
              <p class="text-sm font-semibold text-text-primary">{{ seasonName(season) }}</p>
              <p class="mt-0.5 text-xs text-text-muted">
                {{ season.episodeFileCount }}/{{ season.episodeCount }} episodes
                <template v-if="season.sizeOnDisk > 0">
                  · {{ formatSize(season.sizeOnDisk) }}</template
                >
                <template v-if="!season.monitored"> · unmonitored</template>
              </p>
            </div>

            <StatusPill :tone="tone(season)">{{ label(season) }}</StatusPill>

            <!-- Rotates to point down while the season is open. -->
            <span
              class="shrink-0 text-text-muted transition-transform group-data-[state=open]:rotate-90"
              aria-hidden="true"
            >
              ›
            </span>
          </AccordionTrigger>
        </AccordionHeader>

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
              <span class="shrink-0 text-xs" :class="episodeClass(episode)">
                {{ episodeState(episode) }}
              </span>
            </li>

            <li v-if="!season.episodes.length" class="px-3.5 py-3 text-sm text-text-muted">
              Sonarr lists no episodes for this season yet.
            </li>
          </ul>
        </AccordionContent>
      </AppCard>
    </AccordionItem>
  </AccordionRoot>
</template>

<script setup lang="ts">
import {
  AccordionContent,
  AccordionHeader,
  AccordionItem,
  AccordionRoot,
  AccordionTrigger,
} from "reka-ui";
import type { EpisodeSummary, SeasonSummary } from "#shared/types";
import { episodeCode } from "#shared/media";
import { formatSize } from "#web/utils/format";
import AppCard from "./ui/AppCard.vue";
import StatusPill from "./ui/StatusPill.vue";
import type { Tone } from "./ui/types";

defineProps<{ seasons: SeasonSummary[] }>();

function seasonName(season: SeasonSummary): string {
  return season.seasonNumber === 0 ? "Specials" : `Season ${season.seasonNumber}`;
}

function label(season: SeasonSummary): string {
  if (season.episodeCount === 0) return "Empty";
  if (season.episodeFileCount === 0) return "Missing";
  return season.episodeFileCount >= season.episodeCount ? "Complete" : "Partial";
}

function tone(season: SeasonSummary): Tone {
  const state = label(season);
  if (state === "Complete") return "green";
  if (state === "Missing") return "red";
  if (state === "Empty") return "neutral";
  return "amber";
}

/** An episode that has not aired is not missing, it is simply not here yet. */
function unaired(episode: EpisodeSummary): boolean {
  return !episode.hasFile && !!episode.airDate && new Date(episode.airDate) > new Date();
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
