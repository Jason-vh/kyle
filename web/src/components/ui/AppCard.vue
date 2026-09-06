<template>
  <div
    class="rounded-card border border-border-primary bg-bg-surface shadow-card"
    :class="[padded ? 'p-3.5' : '', interactive ? 'transition-colors hover:bg-bg-elevated' : '']"
  >
    <slot />
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ padded?: boolean; interactive?: boolean }>(), { padded: true });
</script>
