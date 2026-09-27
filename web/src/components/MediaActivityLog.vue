<template>
  <div>
    <ol>
      <li v-for="day in days" :key="day.label">
        <h3 class="pb-2 text-xs font-medium text-text-muted">{{ day.label }}</h3>
        <ol>
          <li
            v-for="event in day.events"
            :key="event.id"
            class="relative flex gap-3 pb-4"
            :class="event === last ? '' : 'connected'"
          >
            <span
              class="flex size-7 shrink-0 items-center justify-center rounded-full border border-border-primary bg-bg-elevated text-text-secondary"
            >
              <component :is="LOOKS[event.kind].icon" class="size-3.5" aria-hidden="true" />
            </span>

            <div class="min-w-0 flex-1 pt-1">
              <p class="text-sm text-text-primary">
                <template v-if="event.person">
                  <span class="font-semibold">{{ capitalized(nameOf(event.person)) }}</span>
                  {{ LOOKS[event.kind].verb }}
                </template>
                <template v-else>{{ LOOKS[event.kind].unattributed }}</template>
                <span v-if="event.detail" class="text-text-secondary"> · {{ event.detail }}</span>
              </p>
            </div>

            <time
              :datetime="event.at"
              :title="new Date(event.at).toLocaleString()"
              class="shrink-0 pt-1 text-xs text-text-muted tabular-nums"
            >
              {{ timeOf(event.at) }}
            </time>
          </li>
        </ol>
      </li>
    </ol>

    <button
      v-if="hidden > 0"
      type="button"
      class="text-sm font-semibold text-text-secondary hover:text-text-primary"
      @click="expanded = true"
    >
      Show {{ hidden }} more
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, type Component } from "vue";
import { capitalized, nameOf } from "#web/utils/people";
import type { MediaActivity, MediaActivityKind } from "#shared/types";
import { formatDate } from "#web/utils/format";
import IconCheck from "~icons/ph/check-bold";
import IconEye from "~icons/ph/eye";
import IconPlus from "~icons/ph/plus-bold";
import IconTrash from "~icons/ph/trash";

const props = defineProps<{ events: MediaActivity[] }>();

/** Enough to answer "when did this come in, and who asked" without scrolling past it. */
const PREVIEW = 5;

interface Look {
  icon: Component;
  /** Follows a name: "Alice watched". */
  verb: string;
  /** Stands alone, for what nobody in particular did. */
  unattributed: string;
}

const LOOKS: Record<MediaActivityKind, Look> = {
  requested: { icon: IconPlus, verb: "requested", unattributed: "Requested" },
  imported: { icon: IconCheck, verb: "downloaded", unattributed: "Downloaded" },
  watched: { icon: IconEye, verb: "watched", unattributed: "Watched" },
  removed: { icon: IconTrash, verb: "removed it", unattributed: "Removed outside Kyle" },
};

const expanded = ref(false);

const shown = computed(() => (expanded.value ? props.events : props.events.slice(0, PREVIEW)));
const hidden = computed(() => props.events.length - shown.value.length);
const last = computed(() => shown.value[shown.value.length - 1]);

function dayLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return formatDate(iso);
}

/** Newest first, one heading per day. */
const days = computed(() => {
  const groups: { label: string; events: MediaActivity[] }[] = [];
  for (const event of shown.value) {
    const label = dayLabel(event.at);
    const group = groups[groups.length - 1];
    if (group?.label === label) group.events.push(event);
    else groups.push({ label, events: [event] });
  }
  return groups;
});

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}
</script>

<style scoped>
/* A thread from each event down to the next, so a day reads as one sequence. */
.connected::before {
  content: "";
  position: absolute;
  top: 2rem;
  bottom: 0.25rem;
  left: calc(0.875rem - 0.75px);
  width: 1.5px;
  background: var(--color-border-primary);
}
</style>
