<template>
  <div class="mx-auto max-w-[800px] p-4 sm:p-8">
    <div v-if="loading" class="py-12 text-center text-text-muted">Loading&hellip;</div>
    <div v-else-if="error" class="py-12 text-center text-accent-red">{{ error }}</div>
    <template v-else-if="thread">
      <header class="mb-6">
        <div class="mb-2 text-sm">
          <router-link
            to="/threads"
            class="inline-flex items-center gap-1 text-text-muted no-underline hover:text-text-primary"
          >
            <IconCaretLeft class="size-4" aria-hidden="true" />
            All conversations
          </router-link>
        </div>
        <h1 class="text-xl font-semibold leading-snug sm:text-2xl">
          {{ thread.pageTitle }}
        </h1>
        <div class="mt-2 flex items-center gap-2 text-sm text-text-muted">
          <component :is="platformIcon" class="size-4" aria-hidden="true" />
          <span>&middot;</span>
          <time :datetime="thread.createdAt">{{ formattedDate }}</time>
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
import { computed, watchEffect, nextTick } from "vue";
import { useTitle } from "@vueuse/core";
import { useRoute } from "vue-router";
import { relativeTime } from "#web/composables/useRelativeTime";
import { useThread } from "#web/queries/threads";
import type { ThreadItem } from "#shared/types";
import MediaRefsSummary from "#web/components/MediaRefsSummary.vue";
import MessageBlock from "#web/components/MessageBlock.vue";
import WebhookBlock from "#web/components/WebhookBlock.vue";
import DateSeparator from "#web/components/DateSeparator.vue";
import IconCaretLeft from "~icons/ph/caret-left";
import IconDiscord from "~icons/ph/discord-logo";
import IconSlack from "~icons/ph/slack-logo";

const route = useRoute();
const {
  data: thread,
  error,
  isPending: loading,
} = useThread(() => ({ id: route.params.id as string }));

useTitle(computed(() => (thread.value ? `${thread.value.pageTitle} — Kyle` : "Kyle")));

const formattedDate = computed(() => (thread.value ? relativeTime(thread.value.createdAt) : ""));

const platformIcon = computed(() =>
  thread.value?.interfaceType === "discord" ? IconDiscord : IconSlack,
);

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

// Jump to a linked message once the thread it lives in has rendered.
watchEffect(async () => {
  if (!thread.value) return;
  await nextTick();

  const hash = window.location.hash.slice(1);
  if (!hash) return;

  const el = document.getElementById(hash);
  if (!el) return;

  const details = el.closest("details");
  if (details && !details.open) details.open = true;
  requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: "start" }));
});
</script>
