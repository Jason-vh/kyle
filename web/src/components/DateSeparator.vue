<template>
  <div class="my-6 flex items-center justify-center first:mt-0">
    <span class="rounded-full bg-bg-elevated px-3 py-1 text-xs text-text-muted">
      {{ label }}
    </span>
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
