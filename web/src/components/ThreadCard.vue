<template>
  <router-link
    :to="`/threads/${thread.id}`"
    class="flex items-center gap-3 rounded-lg border border-border-subtle bg-bg-surface px-4 py-3.5 transition-colors hover:border-border-muted hover:bg-bg-elevated no-underline"
  >
    <div class="min-w-0 flex-1">
      <div class="flex items-center gap-2">
        <!-- Interface icon -->
        <span
          v-if="thread.interfaceType === 'discord'"
          class="inline-flex shrink-0 items-center text-accent-cyan"
          v-html="discordIcon"
        ></span>
        <span
          v-else
          class="inline-flex shrink-0 items-center text-accent-blue"
          v-html="slackIcon"
        ></span>
        <span class="truncate text-[0.9375rem] font-medium">{{ thread.preview }}</span>
      </div>
      <div class="mt-0.5 flex items-center gap-3">
        <time :datetime="thread.createdAt" class="text-xs text-text-muted">{{
          formattedDate
        }}</time>
        <span class="text-xs text-text-muted">{{ thread.messageCount }} messages</span>
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
        class="inline-block max-w-40 truncate rounded px-1.5 py-0.5 text-[0.6875rem] font-semibold"
        :class="ref.action === 'add' ? 'pill-add' : 'pill-remove'"
      >
        {{ ref.action === "add" ? "+" : "−" }} {{ ref.title }}
      </span>
    </div>
    <!-- Share button -->
    <button
      v-if="thread.shareUrl"
      class="hidden shrink-0 items-center justify-center rounded-md border border-border-muted text-text-muted transition-colors hover:border-text-secondary hover:text-text-primary group-hover:inline-flex md:inline-flex"
      style="width: 32px; height: 32px"
      @click.prevent="copyShareUrl"
      title="Copy share link"
      v-html="copied ? '✓' : shareIcon"
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

const slackIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2a2.5 2.5 0 0 0 0 5H17V4.5A2.5 2.5 0 0 0 14.5 2z"/><path d="M7 5h3.5"/><path d="M2 9.5a2.5 2.5 0 0 0 5 0V7H4.5A2.5 2.5 0 0 0 2 9.5z"/><path d="M5 12v3.5"/><path d="M9.5 22a2.5 2.5 0 0 0 0-5H7v2.5A2.5 2.5 0 0 0 9.5 22z"/><path d="M12 19h5"/><path d="M22 14.5a2.5 2.5 0 0 0-5 0V17h2.5a2.5 2.5 0 0 0 2.5-2.5z"/><path d="M19 12V7"/></svg>`;
const discordIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>`;
const shareIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>`;
</script>

<style scoped>
.pill-add {
  background: color-mix(in srgb, var(--color-accent-green) 15%, var(--color-bg-elevated));
  color: var(--color-accent-green);
}
.pill-remove {
  background: color-mix(in srgb, var(--color-accent-red) 15%, var(--color-bg-elevated));
  color: var(--color-accent-red);
}
</style>
