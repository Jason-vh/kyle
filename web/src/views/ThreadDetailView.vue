<template>
  <div class="mx-auto max-w-[800px] p-4 sm:p-8">
    <div v-if="loading" class="py-12 text-center text-text-muted">Loading…</div>
    <div v-else-if="error" class="py-12 text-center text-accent-red">{{ error }}</div>
    <template v-else-if="thread">
      <header
        class="mb-5 flex flex-col gap-3 border-b border-border-subtle pb-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
      >
        <div>
          <div v-if="thread.shareUrl" class="mb-1 text-[0.8125rem] text-text-secondary">
            <router-link to="/threads" class="text-accent-blue hover:underline"
              >&larr; All threads</router-link
            >
          </div>
          <h1 class="text-xl font-semibold leading-snug">{{ thread.pageTitle }}</h1>
          <div class="mt-1 flex items-center gap-2 text-[0.8125rem] text-text-secondary">
            <span
              v-if="thread.interfaceType === 'discord'"
              class="inline-flex items-center text-accent-cyan"
              v-html="discordIcon"
            ></span>
            <span
              v-else
              class="inline-flex items-center text-accent-blue"
              v-html="slackIcon"
            ></span>
            <time :datetime="thread.createdAt">{{ formattedDate }}</time>
          </div>
        </div>
        <button
          v-if="thread.shareUrl"
          class="inline-flex shrink-0 items-center gap-1.5 self-start rounded-md border border-border-muted bg-bg-elevated px-3 py-1.5 text-[0.8125rem] text-text-secondary transition-colors hover:border-text-secondary hover:text-text-primary"
          @click="copyShareUrl"
        >
          <span v-html="copied ? '' : shareIcon"></span>
          {{ copied ? "Copied!" : "Share" }}
        </button>
      </header>

      <MediaRefsSummary :refs="thread.mediaRefs" />

      <template v-for="(item, index) in thread.items" :key="itemKey(item, index)">
        <DateSeparator v-if="showDateSeparator(index)" :date="itemDate(item)" />
        <MessageBlock v-if="item.kind === 'message'" :msg="item.message" />
        <WebhookBlock v-else :notification="item.notification" />
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRoute } from "vue-router";
import { getThread } from "../api/threads";
import { relativeTime } from "../composables/useRelativeTime";
import type { ThreadDetail, ThreadItem } from "@shared/types";
import MediaRefsSummary from "../components/MediaRefsSummary.vue";
import MessageBlock from "../components/MessageBlock.vue";
import WebhookBlock from "../components/WebhookBlock.vue";
import DateSeparator from "../components/DateSeparator.vue";

const route = useRoute();
const thread = ref<ThreadDetail | null>(null);
const loading = ref(true);
const error = ref("");
const copied = ref(false);

const formattedDate = computed(() => (thread.value ? relativeTime(thread.value.createdAt) : ""));

function itemKey(item: ThreadItem, index: number): string {
  if (item.kind === "message") return item.message.id;
  return item.notification.id ?? `webhook-${index}`;
}

function itemDate(item: ThreadItem): string {
  if (item.kind === "message") return item.message.createdAt;
  return item.notification.receivedAt;
}

function showDateSeparator(index: number): boolean {
  if (!thread.value) return false;
  const items = thread.value.items;
  const current = items[index]!;
  const currentDate = new Date(itemDate(current));
  const currentDay = `${currentDate.getFullYear()}-${currentDate.getMonth()}-${currentDate.getDate()}`;

  if (index === 0) return true;

  const prev = items[index - 1]!;
  const prevDate = new Date(itemDate(prev));
  const prevDay = `${prevDate.getFullYear()}-${prevDate.getMonth()}-${prevDate.getDate()}`;

  return currentDay !== prevDay;
}

function copyShareUrl() {
  if (thread.value?.shareUrl) {
    navigator.clipboard.writeText(thread.value.shareUrl).catch(() => {});
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  }
}

onMounted(async () => {
  try {
    const id = route.params.id as string;
    const sig = (route.query.sig as string) ?? undefined;
    thread.value = await getThread(id, sig);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to load thread";
  } finally {
    loading.value = false;
  }
});

const slackIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2a2.5 2.5 0 0 0 0 5H17V4.5A2.5 2.5 0 0 0 14.5 2z"/><path d="M7 5h3.5"/><path d="M2 9.5a2.5 2.5 0 0 0 5 0V7H4.5A2.5 2.5 0 0 0 2 9.5z"/><path d="M5 12v3.5"/><path d="M9.5 22a2.5 2.5 0 0 0 0-5H7v2.5A2.5 2.5 0 0 0 9.5 22z"/><path d="M12 19h5"/><path d="M22 14.5a2.5 2.5 0 0 0-5 0V17h2.5a2.5 2.5 0 0 0 2.5-2.5z"/><path d="M19 12V7"/></svg>`;
const discordIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>`;
const shareIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>`;
</script>
