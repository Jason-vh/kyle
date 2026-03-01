<template>
  <router-link
    :to="`/threads/${thread.id}`"
    class="group flex items-center gap-3 rounded-lg px-2 py-3 no-underline transition-colors hover:bg-bg-elevated"
  >
    <div class="min-w-0 flex-1">
      <span class="block truncate text-sm font-medium text-text-primary">{{ thread.preview }}</span>
      <div class="mt-0.5 flex items-center gap-2 text-xs text-text-muted">
        <span class="flex items-center gap-1" v-html="platformIcon"></span>
        <span>&middot;</span>
        <time :datetime="thread.createdAt">{{ formattedDate }}</time>
        <span>&middot;</span>
        <span>{{ thread.messageCount }} msg</span>
      </div>
    </div>
    <!-- Media ref pills -->
    <div
      v-if="thread.mediaRefs.length > 0"
      class="hidden shrink-0 flex-wrap gap-1 md:flex"
      style="max-width: 260px"
    >
      <span
        v-for="(ref, i) in thread.mediaRefs"
        :key="i"
        class="inline-block max-w-40 truncate rounded-full px-2 py-0.5 text-xs font-medium"
        :class="
          ref.action === 'add'
            ? 'bg-accent-green-light text-accent-green'
            : 'bg-accent-red-light text-accent-red'
        "
      >
        {{ ref.action === "add" ? "+" : "\u2212" }} {{ ref.title }}
      </span>
    </div>
    <!-- Share button -->
    <button
      v-if="thread.shareUrl"
      class="hidden shrink-0 items-center justify-center rounded-lg border border-border-primary text-text-muted transition-colors hover:border-border-secondary hover:text-text-primary group-hover:inline-flex md:inline-flex"
      style="width: 32px; height: 32px"
      @click.prevent="copyShareUrl"
      title="Copy share link"
      v-html="copied ? '\u2713' : shareIcon"
    ></button>
  </router-link>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import type { ThreadListItem } from "@shared/types";

const props = defineProps<{ thread: ThreadListItem }>();

const copied = ref(false);

const formattedDate = computed(() => {
  const d = new Date(props.thread.createdAt);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
});

const platformIcon = computed(() => {
  if (props.thread.interfaceType === "discord") {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>`;
  }
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.122 2.521a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.268 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zm-2.523 10.122a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.268a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.528 2.528 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/></svg>`;
});

function copyShareUrl() {
  if (props.thread.shareUrl) {
    navigator.clipboard.writeText(props.thread.shareUrl).catch(() => {});
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  }
}

const shareIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>`;
</script>
