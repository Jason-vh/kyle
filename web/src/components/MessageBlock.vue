<template>
  <!-- User message -->
  <div
    v-if="msg.role === 'user'"
    :id="msg.id"
    class="message-block fade-in rule-top relative mb-4 pt-3 scroll-mt-4"
  >
    <div class="mb-1 flex items-baseline gap-2">
      <span class="font-ui text-xs font-semibold tracking-widest uppercase text-text-secondary">
        {{ msg.username }}
      </span>
      <time
        :datetime="msg.createdAt"
        class="font-ui ml-auto whitespace-nowrap text-xs text-text-muted"
      >
        {{ time }}
      </time>
    </div>
    <MarkdownContent v-if="msg.textContent" :text="msg.textContent" />
  </div>

  <!-- Error message -->
  <div
    v-else-if="msg.stopReason === 'error'"
    :id="msg.id"
    class="message-block fade-in relative mb-4 border-l-2 border-l-accent-red bg-bg-surface p-4 scroll-mt-4"
  >
    <div class="mb-1 flex items-baseline gap-2">
      <span
        class="font-ui text-[0.6875rem] font-semibold tracking-widest uppercase text-accent-red"
      >
        Correction
      </span>
      <time
        :datetime="msg.createdAt"
        class="font-ui ml-auto whitespace-nowrap text-xs text-text-muted"
      >
        {{ time }}
      </time>
    </div>
    <div class="text-[0.9375rem]">{{ msg.errorMessage }}</div>
    <details v-if="msg.errorRaw" class="error-raw">
      <summary
        class="font-ui cursor-pointer py-0.5 text-xs text-text-muted hover:text-text-secondary"
      >
        Raw error
      </summary>
      <pre
        class="mt-1 overflow-x-auto border-t border-b border-border-subtle bg-bg-elevated p-2 font-mono text-xs text-accent-red"
        >{{ msg.errorRaw }}</pre
      >
    </details>
  </div>

  <!-- Tool use message -->
  <details
    v-else-if="msg.stopReason === 'toolUse'"
    :id="msg.id"
    :open="msg.hasErrors"
    class="message-block fade-in relative mb-4 cursor-pointer bg-bg-elevated/50 p-3 opacity-70 scroll-mt-4"
  >
    <summary class="flex gap-3 list-none">
      <div class="min-w-0 flex-1">
        <div class="mb-1 flex items-baseline gap-2">
          <span
            class="font-ui text-[0.6875rem] font-semibold tracking-widest uppercase text-text-muted"
          >
            Notes
          </span>
          <time
            :datetime="msg.createdAt"
            class="font-ui ml-auto whitespace-nowrap text-xs text-text-muted"
          >
            {{ time }}
          </time>
        </div>
        <div v-if="msg.textContent" class="mb-2 text-sm italic text-text-secondary">
          <MarkdownContent :text="msg.textContent" />
        </div>
        <div
          v-for="tc in msg.toolCalls"
          :key="tc.id"
          class="font-ui flex items-center gap-2 py-0.5 text-[0.8125rem] text-text-muted"
        >
          <span
            class="inline-block size-1.5 shrink-0"
            :class="tc.result?.isError ? 'bg-accent-red' : 'bg-accent-green'"
          ></span>
          <span class="truncate">{{ tc.summaryText }}</span>
        </div>
      </div>
    </summary>
    <div class="rule-top mt-2 space-y-4 pt-2">
      <ToolCallBlock v-for="tc in msg.toolCalls" :key="tc.id" :tc="tc" />
    </div>
  </details>

  <!-- Assistant text message (endTurn) -->
  <div
    v-else
    :id="msg.id"
    class="message-block fade-in relative mb-4 scroll-mt-4"
    :class="{ 'drop-cap': isFirst }"
  >
    <div class="rule-top-strong pt-3">
      <div class="mb-1 flex items-baseline gap-2">
        <UserAvatar name="Kyle" />
        <span class="font-serif text-sm italic text-accent-purple">Kyle</span>
        <time
          :datetime="msg.createdAt"
          class="font-ui ml-auto whitespace-nowrap text-xs text-text-muted"
        >
          {{ time }}
        </time>
      </div>
    </div>
    <MarkdownContent v-if="msg.textContent" :text="msg.textContent" />
    <div v-if="msg.toolCalls?.length" class="mt-1">
      <div
        v-for="tc in msg.toolCalls"
        :key="tc.id"
        class="font-ui flex items-center gap-2 py-0.5 text-[0.8125rem] text-text-muted"
      >
        <span
          class="inline-block size-1.5 shrink-0"
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

const props = defineProps<{ msg: ThreadMessage; isFirst?: boolean }>();

const time = computed(() => relativeTime(props.msg.createdAt));
</script>

<style scoped>
.message-block summary::-webkit-details-marker {
  display: none;
}
</style>
