<template>
  <div class="flex flex-col gap-2">
    <AppCard v-for="row in count" :key="row">
      <div class="flex items-center gap-3">
        <!-- 2:3, the same shape the poster will take when it arrives. -->
        <Skeleton class="shrink-0" :class="POSTER[size]" />

        <div class="min-w-0 flex-1 space-y-2">
          <Skeleton class="h-3.5 w-1/2" />
          <Skeleton class="h-3 w-1/3" />
          <Skeleton v-if="size === 'lg'" class="h-3 w-2/3" />
        </div>

        <Skeleton class="h-5 w-16 shrink-0 rounded-full" />
      </div>
    </AppCard>
  </div>
</template>

<script setup lang="ts">
import AppCard from "./ui/AppCard.vue";
import Skeleton from "./ui/Skeleton.vue";

type Size = "sm" | "md" | "lg";

const POSTER: Record<Size, string> = {
  sm: "h-15 w-10",
  md: "h-18 w-12",
  lg: "h-27 w-18",
};

withDefaults(defineProps<{ count?: number; size?: Size }>(), { count: 4, size: "md" });
</script>
