<template>
  <!-- User message -->
  <div
    v-if="msg.role === 'user'"
    :id="msg.id"
    class="message-block fade-in relative mb-4 rounded-lg border border-border-primary bg-bg-surface p-4 scroll-mt-4"
  >
    <div class="mb-2 flex items-center gap-2">
      <UserAvatar :name="msg.username" />
      <span class="text-sm font-semibold text-text-primary">{{ msg.username }}</span>
      <time :datetime="msg.createdAt" class="ml-auto whitespace-nowrap text-xs text-text-muted">
        {{ time }}
      </time>
    </div>
    <MarkdownContent v-if="msg.textContent" :text="msg.textContent" />
  </div>

  <!-- Error message -->
  <div
    v-else-if="msg.stopReason === 'error'"
    :id="msg.id"
    class="message-block fade-in relative mb-4 rounded-lg bg-accent-red-light p-4 scroll-mt-4"
  >
    <div class="mb-2 flex items-center gap-2">
      <span
        class="flex size-6 items-center justify-center rounded-full bg-accent-red text-xs font-bold text-text-inverse"
        >!</span
      >
      <span class="text-sm font-semibold text-accent-red">Error</span>
      <time :datetime="msg.createdAt" class="ml-auto whitespace-nowrap text-xs text-text-muted">
        {{ time }}
      </time>
    </div>
    <div class="text-sm">{{ msg.errorMessage }}</div>
    <details v-if="msg.errorRaw" class="error-raw mt-2">
      <summary class="cursor-pointer text-xs text-text-muted hover:text-text-secondary">
        Raw error
      </summary>
      <pre
        class="mt-1 overflow-x-auto rounded-lg border border-border-primary bg-bg-elevated p-2 font-mono text-xs text-accent-red"
        >{{ msg.errorRaw }}</pre
      >
    </details>
  </div>

  <!-- Tool use message -->
  <details
    v-else-if="msg.stopReason === 'toolUse'"
    :id="msg.id"
    :open="msg.hasErrors"
    class="message-block fade-in relative mb-4 cursor-pointer p-3 opacity-60 scroll-mt-4"
  >
    <summary class="flex gap-3 list-none">
      <div class="min-w-0 flex-1">
        <div class="mb-1 flex items-center gap-2">
          <span class="text-xs font-medium text-text-muted">Tool calls</span>
          <time :datetime="msg.createdAt" class="ml-auto whitespace-nowrap text-xs text-text-muted">
            {{ time }}
          </time>
        </div>
        <div v-if="msg.textContent" class="mb-2 text-sm italic text-text-muted">
          {{ msg.textContent }}
        </div>
        <div
          v-for="tc in msg.toolCalls"
          :key="tc.id"
          class="flex items-center gap-2 py-0.5 text-sm text-text-muted"
        >
          <span
            class="inline-block size-2 shrink-0 rounded-full"
            :class="tc.result?.isError ? 'bg-accent-red' : 'bg-accent-green'"
          ></span>
          <span class="truncate">{{ tc.summaryText }}</span>
        </div>
      </div>
    </summary>
    <div class="mt-2 space-y-4 border-t border-border-primary pt-2">
      <ToolCallBlock v-for="tc in msg.toolCalls" :key="tc.id" :tc="tc" />
    </div>
  </details>

  <!-- Assistant text message (endTurn) -->
  <div
    v-else
    :id="msg.id"
    class="message-block fade-in relative mb-4 rounded-lg border border-border-primary bg-bg-surface p-4 scroll-mt-4"
  >
    <div class="mb-2 flex items-center gap-2">
      <UserAvatar name="Kyle" />
      <span class="text-sm font-semibold text-accent-purple">Kyle</span>
      <time :datetime="msg.createdAt" class="ml-auto whitespace-nowrap text-xs text-text-muted">
        {{ time }}
      </time>
    </div>
    <MarkdownContent v-if="msg.textContent" :text="msg.textContent" />
    <div v-if="msg.toolCalls?.length" class="mt-1">
      <div
        v-for="tc in msg.toolCalls"
        :key="tc.id"
        class="flex items-center gap-2 py-0.5 text-sm text-text-muted"
      >
        <span
          class="inline-block size-1.5 shrink-0 rounded-full"
          :class="tc.result?.isError ? 'bg-accent-red' : 'bg-accent-green'"
        ></span>
        <span class="truncate">{{ tc.summaryText }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { relativeTime } from "../composables/useRelativeTime";
import type { ThreadMessage } from "@shared/types";
import UserAvatar from "./UserAvatar.vue";
import MarkdownContent from "./MarkdownContent.vue";
import ToolCallBlock from "./ToolCallBlock.vue";

const props = defineProps<{ msg: ThreadMessage }>();

const time = computed(() => relativeTime(props.msg.createdAt));
</script>

<style scoped>
.message-block summary::-webkit-details-marker {
  display: none;
}
</style>
