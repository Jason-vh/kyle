<template>
  <div class="my-6 flex items-center gap-4 first:mt-0">
    <div class="h-px flex-1 bg-border-rule-light"></div>
    <span
      class="font-ui whitespace-nowrap text-[0.6875rem] tracking-widest uppercase text-text-muted"
    >
      {{ label }}
    </span>
    <div class="h-px flex-1 bg-border-rule-light"></div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{ date: string }>();

const label = computed(() => {
  const d = new Date(props.date);
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
});
</script>
