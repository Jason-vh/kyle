<template>
  <router-link
    :to="`/threads/${thread.id}`"
    class="group flex items-start gap-3 rounded-lg px-2 py-3 no-underline transition-colors hover:bg-bg-elevated"
  >
    <!-- Platform icon -->
    <div
      class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-bg-elevated text-text-muted"
    >
      <component :is="platformIcon" class="size-5" aria-hidden="true" />
    </div>
    <div class="min-w-0 flex-1">
      <span class="block truncate text-sm font-medium text-text-primary">{{ thread.preview }}</span>
      <div class="mt-0.5 flex items-center gap-2 text-xs text-text-muted">
        <time :datetime="thread.createdAt">{{ formattedDate }}</time>
        <span>&middot;</span>
        <span>{{ thread.messageCount }} messages</span>
      </div>
      <!-- Media ref pills -->
      <div v-if="thread.mediaRefs.length > 0" class="mt-1.5 hidden flex-wrap gap-1 md:flex">
        <span
          v-for="(ref, i) in thread.mediaRefs"
          :key="i"
          class="inline-block max-w-48 truncate rounded-full px-2 py-0.5 text-xs font-medium"
          :class="
            ref.action === 'add'
              ? 'bg-accent-green-light text-accent-green'
              : 'bg-accent-red-light text-accent-red'
          "
        >
          {{ ref.action === "add" ? "+" : "\u2212" }} {{ ref.title }}
        </span>
      </div>
    </div>
  </router-link>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { ThreadListItem } from "#shared/types";
import IconChat from "~icons/ph/chat-circle";
import IconDiscord from "~icons/ph/discord-logo";
import IconSlack from "~icons/ph/slack-logo";

const props = defineProps<{ thread: ThreadListItem }>();

const formattedDate = computed(() => {
  const d = new Date(props.thread.createdAt);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
});

const platformIcon = computed(() => {
  switch (props.thread.interfaceType) {
    case "discord":
      return IconDiscord;
    case "slack":
      return IconSlack;
    default:
      return IconChat;
  }
});
</script>
