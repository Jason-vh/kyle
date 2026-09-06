<template>
  <div class="mb-2.5 flex items-baseline justify-between gap-3">
    <h2 class="text-sm font-semibold tracking-wide text-text-muted uppercase">{{ title }}</h2>
    <router-link
      v-if="to"
      :to="to"
      class="text-xs font-semibold text-accent-purple no-underline hover:underline"
    >
      See all<template v-if="count"> ({{ count }})</template>
    </router-link>
  </div>
</template>

<script setup lang="ts">
defineProps<{ title: string; to?: string; count?: number }>();
</script>
