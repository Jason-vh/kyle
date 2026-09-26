<template>
  <AppCard :padded="false">
    <ol class="divide-y divide-border-primary">
      <li v-for="event in events" :key="event.id" class="flex items-start gap-3 px-3.5 py-2.5">
        <span
          class="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full"
          :class="LOOKS[event.kind].tint"
        >
          <component :is="LOOKS[event.kind].icon" class="size-3.5" aria-hidden="true" />
        </span>

        <div class="min-w-0 flex-1">
          <p class="text-sm text-text-primary">
            <template v-if="event.person">
              <span class="font-semibold">{{ event.person.name }}</span>
              {{ LOOKS[event.kind].verb }}
            </template>
            <template v-else>{{ LOOKS[event.kind].unattributed }}</template>
          </p>
          <p v-if="event.detail" class="truncate text-xs text-text-muted">{{ event.detail }}</p>
        </div>

        <time
          :datetime="event.at"
          :title="new Date(event.at).toLocaleString()"
          class="shrink-0 text-xs text-text-muted"
        >
          {{ when(event.at) }}
        </time>
      </li>
    </ol>
  </AppCard>
</template>

<script setup lang="ts">
import type { Component } from "vue";
import type { MediaActivity, MediaActivityKind } from "#shared/types";
import { relativeTime } from "#web/composables/useRelativeTime";
import { formatDate } from "#web/utils/format";
import AppCard from "./ui/AppCard.vue";
import IconCheck from "~icons/ph/check-bold";
import IconDownload from "~icons/ph/download-simple-bold";
import IconEye from "~icons/ph/eye-fill";
import IconPlus from "~icons/ph/plus-bold";
import IconTrash from "~icons/ph/trash-bold";

defineProps<{ events: MediaActivity[] }>();

interface Look {
  icon: Component;
  tint: string;
  /** Follows a name: "Alice watched". */
  verb: string;
  /** Stands alone, for what nobody in particular did. */
  unattributed: string;
}

const LOOKS: Record<MediaActivityKind, Look> = {
  requested: {
    icon: IconPlus,
    tint: "bg-accent-purple-light text-accent-purple",
    verb: "requested",
    unattributed: "Requested",
  },
  grabbed: {
    icon: IconDownload,
    tint: "bg-accent-blue-light text-accent-blue",
    verb: "started the download",
    unattributed: "Download started",
  },
  imported: {
    icon: IconCheck,
    tint: "bg-accent-green-light text-accent-green",
    verb: "downloaded",
    unattributed: "Downloaded",
  },
  watched: {
    icon: IconEye,
    tint: "bg-accent-cyan-light text-accent-cyan",
    verb: "watched",
    unattributed: "Watched",
  },
  removed: {
    icon: IconTrash,
    tint: "bg-accent-red-light text-accent-red",
    verb: "removed it",
    unattributed: "Removed outside Kyle",
  },
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Relative while recent; a date once "Tuesday" would be ambiguous. */
function when(iso: string): string {
  if (Date.now() - Date.parse(iso) < WEEK_MS) return relativeTime(iso);
  return formatDate(iso);
}
</script>
