<template>
  <div class="shrink-0 overflow-hidden rounded-lg bg-bg-elevated" :class="SIZES[size]">
    <img
      v-if="src"
      :src="src"
      :alt="alt"
      loading="lazy"
      class="size-full object-cover"
      @error="broken = true"
      v-show="!broken"
    />
    <div
      v-if="!src || broken"
      class="flex size-full items-center justify-center text-[10px] text-text-muted"
    >
      No art
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";

type Size = "sm" | "md" | "lg";

/** 2:3, the aspect every poster art source uses. */
const SIZES: Record<Size, string> = {
  sm: "h-15 w-10",
  md: "h-18 w-12",
  lg: "h-27 w-18",
};

withDefaults(defineProps<{ src?: string | null; alt: string; size?: Size }>(), { size: "md" });

const broken = ref(false);
</script>
