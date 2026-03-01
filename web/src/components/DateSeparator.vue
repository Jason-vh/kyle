<template>
  <div class="my-5 flex items-center gap-4 first:mt-0">
    <div class="h-px flex-1 bg-border-subtle"></div>
    <span class="whitespace-nowrap text-xs text-text-muted">{{ label }}</span>
    <div class="h-px flex-1 bg-border-subtle"></div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{ date: string }>();

const label = computed(() => {
  const d = new Date(props.date);
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
});
</script>
