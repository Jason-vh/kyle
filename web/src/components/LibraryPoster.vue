<template>
  <div
    class="relative aspect-2/3 w-11 shrink-0 transition-transform duration-350 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-active:scale-92 group-active:duration-120 group-active:ease-out"
    :class="{ 'opacity-45 grayscale': dimmed }"
    aria-hidden="true"
  >
    <template v-if="src && !broken">
      <img
        :src="src"
        alt=""
        loading="lazy"
        class="absolute inset-0 size-full translate-y-1.5 scale-90 rounded-lg object-cover opacity-55 blur-md saturate-180"
      />
      <img
        :src="src"
        alt=""
        loading="lazy"
        class="relative size-full rounded-md object-cover ring-1 ring-text-primary/6"
        @error="broken = true"
      />
    </template>
    <div v-else class="size-full rounded-md bg-bg-elevated" />
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";

defineProps<{ src?: string | null; dimmed?: boolean }>();

const broken = ref(false);
</script>
