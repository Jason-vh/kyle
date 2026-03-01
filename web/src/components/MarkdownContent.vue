<template>
  <!-- eslint-disable-next-line vue/no-v-html -->
  <div class="content" v-html="rendered"></div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { renderMarkdown } from "../utils/markdown";

const props = defineProps<{ text: string }>();

const rendered = computed(() => renderMarkdown(props.text));
</script>

<style scoped>
.content {
  word-break: break-word;
  line-height: 1.7;
}
.content :deep(p) {
  margin-bottom: 0.5em;
}
.content :deep(p:last-child) {
  margin-bottom: 0;
}
.content :deep(a) {
  color: var(--color-accent-blue);
  text-decoration: underline;
  text-decoration-style: dotted;
  text-underline-offset: 2px;
}
.content :deep(a:hover) {
  text-decoration-style: solid;
}
.content :deep(ul) {
  list-style-type: disc;
  margin: 0.5em 0;
  padding-left: 1.5em;
}
.content :deep(li) {
  margin-bottom: 0.25em;
}
.content :deep(code) {
  background: var(--color-bg-elevated);
  padding: 0.125em 0.375em;
  font-size: 0.875em;
  font-family: var(--font-family-mono);
}
.content :deep(pre) {
  background: var(--color-bg-elevated);
  padding: 0.75rem;
  overflow-x: auto;
  font-size: 0.8125rem;
  margin: 0.5em 0;
  border-top: 1px solid var(--color-border-subtle);
  border-bottom: 1px solid var(--color-border-subtle);
  font-family: var(--font-family-mono);
}
.content :deep(pre code) {
  background: none;
  padding: 0;
  font-size: inherit;
}
.content :deep(strong) {
  font-weight: 500;
}
</style>
