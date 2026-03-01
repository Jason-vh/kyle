<template>
  <div class="tool-call-detail">
    <div>
      <div
        class="font-ui mb-0.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-text-muted"
      >
        {{ tc.name }} — Input
      </div>
      <pre class="tool-pre">{{ prettyArgs }}</pre>
    </div>
    <div v-if="tc.result">
      <div
        class="font-ui mb-0.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-text-muted"
      >
        Output{{ tc.result.isError ? " (error)" : "" }}
      </div>
      <pre class="tool-pre" :class="{ 'text-accent-red': tc.result.isError }">{{
        prettyResult
      }}</pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { ToolCallSummary } from "@shared/types";

const props = defineProps<{ tc: ToolCallSummary }>();

const prettyArgs = computed(() => JSON.stringify(props.tc.arguments, null, 2));

const prettyResult = computed(() => {
  if (!props.tc.result) return "";
  const text = props.tc.result.text;
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
});
</script>

<style scoped>
.tool-call-detail {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.tool-pre {
  background: var(--color-bg-elevated);
  padding: 0.5rem;
  overflow-x: auto;
  font-size: 0.75rem;
  margin-top: 0.25rem;
  border-top: 1px solid var(--color-border-subtle);
  border-bottom: 1px solid var(--color-border-subtle);
  max-height: 300px;
  overflow-y: auto;
  font-family: var(--font-family-mono);
}
</style>
