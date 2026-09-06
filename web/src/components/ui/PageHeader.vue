<template>
  <header class="mb-5 flex items-start justify-between gap-3">
    <div class="min-w-0">
      <h1 class="truncate text-xl font-semibold text-text-primary">{{ title }}</h1>
      <p v-if="subtitle" class="mt-0.5 text-sm text-text-muted">{{ subtitle }}</p>
    </div>
    <!-- Actions or a summary figure, kept out of the title's way. -->
    <div v-if="$slots.aside" class="shrink-0 pt-0.5"><slot name="aside" /></div>
  </header>
</template>

<script setup lang="ts">
defineProps<{ title: string; subtitle?: string }>();
</script>
