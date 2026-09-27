<template>
  <div
    class="flex h-1.5 gap-0.5"
    role="img"
    :aria-label="`${season.episodeFileCount} of ${season.episodeCount} episodes downloaded`"
  >
    <template v-if="segmented">
      <span
        v-for="episode in season.episodes"
        :key="episode.episodeNumber"
        class="flex-1 rounded-[2px]"
        :class="MARKS[episodeMark(episode)]"
      />
    </template>
    <span v-else class="flex-1 overflow-hidden rounded-full bg-border-secondary">
      <span class="block h-full bg-text-secondary" :style="{ width: `${share}%` }" />
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { SeasonSummary } from "#shared/types";
import { episodeMark, type EpisodeMark } from "#web/utils/episodes";

const props = defineProps<{ season: SeasonSummary }>();

/** Past this, a segment per episode is too thin to point at, so the bar is one fill. */
const MAX_SEGMENTS = 40;

const MARKS: Record<EpisodeMark, string> = {
  present: "bg-text-secondary",
  missing: "bg-border-secondary",
  pending: "hatched",
};

const segmented = computed(() => props.season.episodes.length <= MAX_SEGMENTS);

const share = computed(() => {
  const { episodeFileCount, episodeCount } = props.season;
  if (episodeCount === 0) return 0;
  return Math.round((episodeFileCount / episodeCount) * 100);
});
</script>

<style scoped>
.hatched {
  background: repeating-linear-gradient(
    135deg,
    var(--color-border-secondary) 0 2px,
    transparent 2px 4px
  );
}
</style>
