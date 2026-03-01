<template>
  <!-- User message -->
  <div
    v-if="msg.role === 'user'"
    :id="msg.id"
    class="message-block relative mb-2 flex gap-3 rounded-lg border-l-3 border-l-accent-blue bg-bg-surface p-3.5 scroll-mt-4"
  >
    <UserAvatar :name="msg.username" />
    <div class="min-w-0 flex-1">
      <div class="mb-1 flex items-baseline gap-2">
        <span class="text-[0.8125rem] font-semibold text-accent-blue">{{ msg.username }}</span>
        <time :datetime="msg.createdAt" class="ml-auto whitespace-nowrap text-xs text-text-muted">
          {{ time }}
        </time>
      </div>
      <MarkdownContent v-if="msg.textContent" :text="msg.textContent" />
    </div>
  </div>

  <!-- Error message -->
  <div
    v-else-if="msg.stopReason === 'error'"
    :id="msg.id"
    class="message-block relative mb-2 flex gap-3 rounded-lg border-l-3 border-l-accent-red p-3.5 scroll-mt-4"
    style="background: color-mix(in srgb, var(--color-accent-red) 8%, var(--color-bg-surface))"
  >
    <UserAvatar name="Kyle" />
    <div class="min-w-0 flex-1">
      <div class="mb-1 flex items-baseline gap-2">
        <span class="text-[0.8125rem] font-semibold text-accent-red">Kyle</span>
        <time :datetime="msg.createdAt" class="ml-auto whitespace-nowrap text-xs text-text-muted">
          {{ time }}
        </time>
      </div>
      <div class="mb-2 text-[0.9375rem]">{{ msg.errorMessage }}</div>
      <details v-if="msg.errorRaw" class="error-raw">
        <summary class="cursor-pointer py-0.5 text-xs text-text-muted hover:text-text-secondary">
          Raw error
        </summary>
        <pre
          class="mt-1 overflow-x-auto rounded-md border border-border-subtle bg-bg-base p-2 text-xs text-accent-red"
          >{{ msg.errorRaw }}</pre
        >
      </details>
    </div>
  </div>

  <!-- Tool use message -->
  <details
    v-else-if="msg.stopReason === 'toolUse'"
    :id="msg.id"
    :open="msg.hasErrors"
    class="message-block relative mb-2 cursor-pointer rounded-lg border-l-2 border-l-accent-purple bg-bg-surface p-3.5 opacity-85 scroll-mt-4"
  >
    <summary class="flex gap-3 list-none">
      <UserAvatar name="Kyle" />
      <div class="min-w-0 flex-1">
        <div class="mb-1 flex items-baseline gap-2">
          <span class="text-[0.8125rem] font-semibold text-accent-purple">Kyle</span>
          <time :datetime="msg.createdAt" class="ml-auto whitespace-nowrap text-xs text-text-muted">
            {{ time }}
          </time>
        </div>
        <div v-if="msg.textContent" class="mb-2 text-sm italic text-text-secondary">
          <MarkdownContent :text="msg.textContent" />
        </div>
        <div
          v-for="tc in msg.toolCalls"
          :key="tc.id"
          class="flex items-center gap-2 py-0.5 text-[0.8125rem] text-text-secondary"
        >
          <span
            class="inline-block size-2 shrink-0 rounded-full"
            :class="tc.result?.isError ? 'bg-accent-red' : 'bg-accent-green'"
          ></span>
          <span class="truncate">{{ tc.summaryText }}</span>
        </div>
      </div>
    </summary>
    <div class="mt-2 ml-[calc(32px+0.75rem)] space-y-4 border-t border-border-subtle pt-2">
      <ToolCallBlock v-for="tc in msg.toolCalls" :key="tc.id" :tc="tc" />
    </div>
  </details>

  <!-- Assistant text message (endTurn) -->
  <div
    v-else
    :id="msg.id"
    class="message-block relative mb-2 flex gap-3 rounded-lg border-l-3 border-l-accent-green bg-bg-surface p-3.5 scroll-mt-4"
  >
    <UserAvatar name="Kyle" />
    <div class="min-w-0 flex-1">
      <div class="mb-1 flex items-baseline gap-2">
        <span class="text-[0.8125rem] font-semibold text-accent-green">Kyle</span>
        <time :datetime="msg.createdAt" class="ml-auto whitespace-nowrap text-xs text-text-muted">
          {{ time }}
        </time>
      </div>
      <MarkdownContent v-if="msg.textContent" :text="msg.textContent" />
      <div v-if="msg.toolCalls?.length" class="mt-1">
        <div
          v-for="tc in msg.toolCalls"
          :key="tc.id"
          class="flex items-center gap-2 py-0.5 text-[0.8125rem] text-text-secondary"
        >
          <span
            class="inline-block size-2 shrink-0 rounded-full"
            :class="tc.result?.isError ? 'bg-accent-red' : 'bg-accent-green'"
          ></span>
          <span class="truncate">{{ tc.summaryText }}</span>
        </div>
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
