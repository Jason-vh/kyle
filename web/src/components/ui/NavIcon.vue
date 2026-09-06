<template>
  <svg class="size-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path :d="PATHS[name]" />
  </svg>
</template>

<script setup lang="ts">
import type { IconName } from "./types";

const PATHS: Record<IconName, string> = {
  home: "M11.3 2.6a1 1 0 0 1 1.4 0l8.3 7.9a1 1 0 0 1 .3.7V20a2 2 0 0 1-2 2h-4.8v-6h-3v6H4.7a2 2 0 0 1-2-2v-8.8a1 1 0 0 1 .3-.7l8.3-7.9Z",
  search:
    "M10.5 3a7.5 7.5 0 0 1 5.96 12.05l4.25 4.24-1.42 1.42-4.24-4.25A7.5 7.5 0 1 1 10.5 3Zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z",
  library:
    "M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm2 2v2h2V5H6Zm10 0v2h2V5h-2ZM6 9v6h12V9H6Zm0 8v2h2v-2H6Zm10 0v2h2v-2h-2Z",
  requests:
    "M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm1 2v8h3.2l1.2 2h5.2l1.2-2H19V6H5Z",
};

defineProps<{ name: IconName }>();
</script>
