<template>
  <!-- One crossfade for every list in the app, so no view animates by hand. -->
  <Transition name="query-state" mode="out-in">
    <div v-if="loading" key="loading">
      <slot name="loading">
        <p class="py-12 text-center text-sm text-text-muted">{{ loadingText }}</p>
      </slot>
    </div>

    <p v-else-if="error" key="error" class="py-12 text-center text-sm break-words text-accent-red">
      {{ typeof error === "string" ? error : error.message }}
    </p>

    <div v-else-if="empty" key="empty" class="py-12 text-center text-sm text-text-muted">
      <slot name="empty">{{ emptyText }}</slot>
    </div>

    <div v-else key="content"><slot /></div>
  </Transition>
</template>

<script setup lang="ts">
/** The loading, failed and empty states every list shares, in one place. */
withDefaults(
  defineProps<{
    loading?: boolean;
    /** A caught `Error` or a message; both end up as its text. */
    error?: Error | string | null;
    empty?: boolean;
    loadingText?: string;
    emptyText?: string;
  }>(),
  { loadingText: "Loading…", emptyText: "Nothing here yet." },
);
</script>

<style scoped>
.query-state-enter-active,
.query-state-leave-active {
  transition:
    opacity 0.2s ease-out,
    transform 0.2s ease-out;
}

.query-state-enter-from,
.query-state-leave-to {
  opacity: 0;
  transform: translateY(4px);
}

@media (prefers-reduced-motion: reduce) {
  .query-state-enter-active,
  .query-state-leave-active {
    transition: none;
  }
}
</style>
