<template>
  <template v-if="watchers.length">
    <HoverCardRoot v-if="canHover" v-model:open="open" :open-delay="120" :close-delay="80">
      <HoverCardTrigger as-child>
        <WatcherStack
          :watchers="ordered"
          :max="max"
          :label="summary"
          tabindex="0"
          class="cursor-pointer"
        />
      </HoverCardTrigger>

      <HoverCardPortal v-if="open">
        <HoverCardContent
          side="top"
          align="end"
          :side-offset="6"
          class="z-30 w-[min(15rem,calc(100vw-2rem))] rounded-card border border-border-primary bg-bg-surface p-2 shadow-raised"
        >
          <ul class="space-y-1.5">
            <li v-for="watcher in ordered" :key="watcher.name" class="flex items-center gap-2">
              <WatcherAvatar :watcher="watcher" />
              <span class="min-w-0 flex-1 truncate text-xs text-text-primary">
                {{ capitalized(nameOf(watcher)) }}
              </span>
              <span v-if="watcher.watchedAt" class="shrink-0 text-xs text-text-muted">
                {{ relativeTime(watcher.watchedAt) }}
              </span>
            </li>
          </ul>
        </HoverCardContent>
      </HoverCardPortal>
    </HoverCardRoot>

    <WatcherStack v-else :watchers="ordered" :max="max" :label="summary" />
  </template>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useMediaQuery } from "@vueuse/core";
import { HoverCardContent, HoverCardPortal, HoverCardRoot, HoverCardTrigger } from "reka-ui";
import type { Watcher } from "#shared/types";
import { capitalized, nameOf, namesOf, youFirst } from "#web/utils/people";
import { relativeTime } from "#web/composables/useRelativeTime";
import WatcherAvatar from "./WatcherAvatar.vue";
import WatcherStack from "./WatcherStack.vue";

const props = withDefaults(defineProps<{ watchers: Watcher[]; max?: number; verb?: string }>(), {
  max: 4,
  verb: "watched this",
});

const canHover = useMediaQuery("(hover: hover)");
const open = ref(false);

const ordered = computed(() => youFirst(props.watchers));

/** "You, Bob and Sue have watched this". */
const summary = computed(() => {
  const [only] = props.watchers;
  const singular = props.watchers.length === 1 && !only?.you;
  return `${capitalized(namesOf(props.watchers))} ${singular ? "has" : "have"} ${props.verb}`;
});
</script>
