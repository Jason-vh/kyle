<template>
  <div class="shrink-0 overflow-hidden rounded-lg bg-bg-elevated" :class="SIZES[size].width">
    <!-- 2:3 is fixed by the artwork, so only the width is a decision. -->
    <AspectRatio :ratio="2 / 3">
      <!-- Fades up out of the placeholder rather than popping in when it decodes. -->
      <img
        v-if="path && !broken"
        :src="posterUrl(path)"
        :srcset="posterSrcset(path)"
        :sizes="`${SIZES[size].pixels}px`"
        :alt="alt"
        loading="lazy"
        class="size-full object-cover transition-opacity duration-300"
        :class="loaded ? 'opacity-100' : 'opacity-0'"
        @load="loaded = true"
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
import { posterSrcset, posterUrl } from "#web/utils/images";

type Size = "sm" | "md" | "lg" | "xl";

const SIZES: Record<Size, { width: string; pixels: number }> = {
  sm: { width: "w-10", pixels: 40 },
  md: { width: "w-12", pixels: 48 },
  lg: { width: "w-18", pixels: 72 },
  xl: { width: "w-22", pixels: 88 },
};

withDefaults(defineProps<{ path?: string | null; alt: string; size?: Size }>(), {
  size: "md",
});

const broken = ref(false);
const loaded = ref(false);
</script>
