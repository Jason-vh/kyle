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
      <a
        :href="anchorUrl(msg.id)"
        class="ml-auto whitespace-nowrap text-xs text-text-muted no-underline hover:text-text-secondary"
      >
        {{ time }}
      </a>
    </div>
    <MarkdownContent v-if="msg.textContent" :text="msg.textContent" />
    <div v-if="msg.images?.length" class="mt-2 flex flex-wrap gap-2">
      <img
        v-for="(img, i) in msg.images"
        :key="i"
        :src="`data:${img.mimeType};base64,${img.data}`"
        class="max-h-64 rounded-md border border-border-primary"
        alt="Attached image"
      />
    </div>
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
      <a
        :href="anchorUrl(msg.id)"
        class="ml-auto whitespace-nowrap text-xs text-text-muted no-underline hover:text-text-secondary"
      >
        {{ time }}
      </a>
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
    class="tool-use-block message-block fade-in relative mb-4 cursor-pointer border-l-2 border-border-secondary pl-3 opacity-60 scroll-mt-4"
  >
    <summary class="flex gap-3 list-none">
      <div class="min-w-0 flex-1">
        <div v-if="msg.textContent" class="mb-2 text-sm italic text-text-muted">
          {{ msg.textContent }}
        </div>
        <div
          v-for="(tc, i) in msg.toolCalls"
          :key="tc.id"
          class="flex items-center gap-2 py-0.5 text-sm text-text-muted"
        >
          <span
            class="inline-block size-2 shrink-0 rounded-full"
            :class="tc.result?.isError ? 'bg-accent-red' : 'bg-accent-green'"
          ></span>
          <span class="min-w-0 truncate">{{ tc.summaryText }}</span>
          <template v-if="i === 0">
            <a
              :href="anchorUrl(msg.id)"
              class="ml-auto shrink-0 whitespace-nowrap text-xs text-text-muted no-underline hover:text-text-secondary"
              @click.stop
            >
              {{ time }}
            </a>
          </template>
        </div>
      </div>
    </summary>
    <div class="mt-2 space-y-4 pt-1">
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
      <a
        :href="anchorUrl(msg.id)"
        class="ml-auto whitespace-nowrap text-xs text-text-muted no-underline hover:text-text-secondary"
      >
        {{ time }}
      </a>
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
import { computed, inject, ref, type Ref } from "vue";
import { relativeTime } from "../composables/useRelativeTime";
import type { ThreadMessage } from "@shared/types";
import UserAvatar from "./UserAvatar.vue";
import MarkdownContent from "./MarkdownContent.vue";
import ToolCallBlock from "./ToolCallBlock.vue";

const props = defineProps<{ msg: ThreadMessage }>();

const shareUrl = inject<Ref<string | null>>("shareUrl", ref(null));

const time = computed(() => relativeTime(props.msg.createdAt));

function anchorUrl(id: string): string {
  const base =
    shareUrl.value ??
    `${window.location.origin}${window.location.pathname}${window.location.search}`;
  return `${base}#${id}`;
}
</script>

<style scoped>
.message-block summary::-webkit-details-marker {
  display: none;
}
</style>
