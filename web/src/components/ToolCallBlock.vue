<template>
  <details :open="autoOpen" class="tool-use-block">
    <summary
      class="flex cursor-pointer items-center gap-2 py-0.5 text-[0.8125rem] text-text-secondary list-none"
    >
      <span
        class="inline-block size-2 shrink-0 rounded-full"
        :class="tc.result?.isError ? 'bg-accent-red' : 'bg-accent-green'"
      ></span>
      <span class="truncate">{{ tc.summaryText }}</span>
    </summary>
    <div class="mt-2 space-y-3 border-t border-border-subtle pt-2 pl-4">
      <div>
        <div class="text-[0.6875rem] font-semibold uppercase tracking-wide text-text-muted mb-0.5">
          {{ tc.name }} — Input
        </div>
        <pre class="tool-pre">{{ prettyArgs }}</pre>
      </div>
      <div v-if="tc.result">
        <div class="text-[0.6875rem] font-semibold uppercase tracking-wide text-text-muted mb-0.5">
          Output{{ tc.result.isError ? " (error)" : "" }}
        </div>
        <pre class="tool-pre" :class="{ 'text-accent-red': tc.result.isError }">{{
          tc.result.text
        }}</pre>
      </div>
    </div>
  </details>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { ToolCallSummary } from "@shared/types";

const props = defineProps<{ tc: ToolCallSummary; autoOpen?: boolean }>();

const prettyArgs = computed(() => JSON.stringify(props.tc.arguments, null, 2));
</script>

<style scoped>
.tool-use-block summary::-webkit-details-marker {
  display: none;
}
.tool-pre {
  background: var(--color-bg-base);
  padding: 0.5rem;
  border-radius: 6px;
  overflow-x: auto;
  font-size: 0.75rem;
  margin-top: 0.25rem;
  border: 1px solid var(--color-border-subtle);
  max-height: 300px;
  overflow-y: auto;
}
</style>
