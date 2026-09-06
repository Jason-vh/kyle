<template>
  <Primitive
    :as="as"
    :as-child="asChild"
    class="rounded-card border border-border-primary bg-bg-surface shadow-card"
    :class="[padded ? 'p-3.5' : '', interactive ? 'transition-colors hover:bg-bg-elevated' : '']"
  >
    <slot />
  </Primitive>
</template>

<script setup lang="ts">
import type { Component } from "vue";
import { Primitive } from "reka-ui";

withDefaults(
  defineProps<{
    padded?: boolean;
    interactive?: boolean;
    /** `li` inside a list, `article` for a standalone item. */
    as?: string | Component;
    /** Style the single child element instead of rendering a wrapper. */
    asChild?: boolean;
  }>(),
  { padded: true, as: "div" },
);
</script>
