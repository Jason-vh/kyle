<template>
  <div class="mx-auto max-w-[800px] p-4 sm:p-8">
    <div v-if="loading" class="py-12 text-center text-text-muted">Loading&hellip;</div>
    <div v-else-if="error" class="py-12 text-center text-accent-red">{{ error }}</div>
    <template v-else-if="thread">
      <header class="mb-6">
        <div v-if="thread.shareUrl" class="font-ui mb-2 text-[0.8125rem]">
          <router-link
            to="/threads"
            class="text-accent-blue underline decoration-dotted underline-offset-2 hover:decoration-solid"
            >&larr; All dispatches</router-link
          >
        </div>
        <h1 class="font-serif text-2xl font-bold leading-snug sm:text-3xl">
          {{ thread.pageTitle }}
        </h1>
        <div class="font-ui mt-2 flex items-center gap-2 text-[0.8125rem] text-text-muted">
          <span class="font-semibold uppercase tracking-wider">{{
            thread.interfaceType === "discord" ? "Discord" : "Slack"
          }}</span>
          <span>&middot;</span>
          <time :datetime="thread.createdAt">{{ formattedDate }}</time>
          <button
            v-if="thread.shareUrl"
            class="font-ui ml-auto inline-flex shrink-0 items-center gap-1.5 self-start border border-border-muted px-3 py-1.5 text-[0.8125rem] text-text-secondary transition-colors hover:border-border-rule hover:text-text-primary"
            @click="copyShareUrl"
          >
            <span v-html="copied ? '' : shareIcon"></span>
            {{ copied ? "Copied!" : "Share" }}
          </button>
        </div>
        <div class="rule-double mt-4 border-border-rule"></div>
      </header>

      <MediaRefsSummary :refs="thread.mediaRefs" />

      <template v-for="(item, index) in thread.items" :key="itemKey(item, index)">
        <DateSeparator v-if="showDateSeparator(index)" :date="itemDate(item)" />
        <MessageBlock
          v-if="item.kind === 'message'"
          :msg="item.message"
          :is-first="index === firstAssistantIndex"
        />
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

const firstAssistantIndex = computed(() => {
  if (!thread.value) return -1;
  return thread.value.items.findIndex(
    (item) =>
      item.kind === "message" &&
      item.message.role === "assistant" &&
      item.message.stopReason === "endTurn",
  );
});

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

const shareIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>`;
</script>
