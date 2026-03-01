<template>
  <router-link
    :to="`/threads/${thread.id}`"
    class="group flex items-center gap-3 border-b border-border-subtle px-1 py-3 no-underline transition-colors hover:bg-bg-elevated"
  >
    <div class="min-w-0 flex-1">
      <span class="truncate font-serif text-lg font-semibold text-text-primary">{{
        thread.preview
      }}</span>
      <div class="font-ui mt-0.5 flex items-center gap-2 text-xs text-text-muted">
        <span class="font-semibold uppercase tracking-wider">{{
          thread.interfaceType === "discord" ? "Discord" : "Slack"
        }}</span>
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
        class="font-ui inline-block max-w-40 truncate border px-1.5 py-0.5 text-[0.6875rem] font-semibold"
        :class="ref.action === 'add' ? 'pill-add' : 'pill-remove'"
      >
        {{ ref.action === "add" ? "+" : "\u2212" }} {{ ref.title }}
      </span>
    </div>
    <!-- Share button -->
    <button
      v-if="thread.shareUrl"
      class="hidden shrink-0 items-center justify-center border border-border-muted text-text-muted transition-colors hover:border-text-secondary hover:text-text-primary group-hover:inline-flex md:inline-flex"
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

<style scoped>
.pill-add {
  border-color: var(--color-accent-green);
  color: var(--color-accent-green);
  background: transparent;
}
.pill-remove {
  border-color: var(--color-accent-red);
  color: var(--color-accent-red);
  background: transparent;
}
</style>
