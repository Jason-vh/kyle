<template>
  <div class="shrink-0 overflow-hidden rounded-lg bg-bg-elevated" :class="WIDTHS[size]">
    <!-- 2:3 is fixed by the artwork, so only the width is a decision. -->
    <AspectRatio :ratio="2 / 3">
      <img
        v-if="src && !broken"
        :src="src"
        :alt="alt"
        loading="lazy"
        class="size-full object-cover"
        @error="broken = true"
      />
      <div
        v-else
        class="flex size-full items-center justify-center text-[10px] text-text-muted"
        aria-hidden="true"
      >
        No art
      </div>
    </AspectRatio>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { AspectRatio } from "reka-ui";

type Size = "sm" | "md" | "lg";

const WIDTHS: Record<Size, string> = {
  sm: "w-10",
  md: "w-12",
  lg: "w-18",
};

withDefaults(defineProps<{ src?: string | null; alt: string; size?: Size }>(), { size: "md" });

const broken = ref(false);
</script>
