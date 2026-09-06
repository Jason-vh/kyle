<template>
  <p v-if="loading" class="py-12 text-center text-sm text-text-muted">{{ loadingText }}</p>
  <p v-else-if="error" class="py-12 text-center text-sm break-words text-accent-red">
    {{ typeof error === "string" ? error : error.message }}
  </p>
  <div v-else-if="empty" class="py-12 text-center text-sm text-text-muted">
    <slot name="empty">{{ emptyText }}</slot>
  </div>
  <slot v-else />
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
