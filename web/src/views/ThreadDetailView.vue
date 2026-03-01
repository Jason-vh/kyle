<template>
  <div class="mx-auto max-w-[800px] p-4 sm:p-8">
    <div v-if="loading" class="py-12 text-center text-text-muted">Loading&hellip;</div>
    <div v-else-if="error" class="py-12 text-center text-accent-red">{{ error }}</div>
    <template v-else-if="thread">
      <header class="mb-6">
        <div v-if="thread.shareUrl" class="mb-2 text-sm">
          <router-link
            to="/threads"
            class="inline-flex items-center gap-1 text-text-muted no-underline hover:text-text-primary"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
            All conversations
          </router-link>
        </div>
        <h1 class="text-xl font-semibold leading-snug sm:text-2xl">
          {{ thread.pageTitle }}
        </h1>
        <div class="mt-2 flex items-center gap-2 text-sm text-text-muted">
          <span class="flex items-center gap-1" v-html="platformIcon"></span>
          <span>&middot;</span>
          <time :datetime="thread.createdAt">{{ formattedDate }}</time>
          <button
            v-if="thread.shareUrl"
            class="ml-auto inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg border border-border-primary px-3 py-1.5 text-sm text-text-secondary transition-colors hover:border-border-secondary hover:text-text-primary"
            @click="copyShareUrl"
          >
            <span v-html="copied ? '' : shareIcon"></span>
            {{ copied ? "Copied!" : "Share" }}
          </button>
        </div>
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
import { ref, computed, provide, onMounted, nextTick } from "vue";
import { useTitle } from "@vueuse/core";
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

useTitle(computed(() => (thread.value ? `${thread.value.pageTitle} — Kyle` : "Kyle")));
const copied = ref(false);

const shareUrl = computed(() => thread.value?.shareUrl ?? null);
provide("shareUrl", shareUrl);

const formattedDate = computed(() => (thread.value ? relativeTime(thread.value.createdAt) : ""));

const platformIcon = computed(() => {
  if (!thread.value) return "";
  if (thread.value.interfaceType === "discord") {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>`;
  }
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.122 2.521a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.268 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zm-2.523 10.122a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.268a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.528 2.528 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/></svg>`;
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

  await nextTick();
  const hash = window.location.hash.slice(1);
  if (hash) {
    const el = document.getElementById(hash);
    if (el) {
      const details = el.closest("details");
      if (details && !details.open) details.open = true;
      requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }
});

const shareIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>`;
</script>
