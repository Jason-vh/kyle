<template>
  <Primitive
    :as="as"
    :as-child="asChild"
    :type="as === 'button' && !asChild ? type : undefined"
    :disabled="disabled || loading || undefined"
    :aria-busy="loading || undefined"
    class="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-control font-semibold no-underline transition-colors disabled:cursor-not-allowed disabled:opacity-50"
    :class="[VARIANTS[variant], SIZES[size], block ? 'w-full' : '']"
  >
    <slot />
  </Primitive>
</template>

<script setup lang="ts">
import type { Component } from "vue";
import { Primitive } from "reka-ui";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent-purple text-text-inverse hover:opacity-90",
  secondary: "border border-border-primary bg-bg-surface text-text-primary hover:bg-bg-elevated",
  ghost: "text-text-secondary hover:bg-bg-elevated",
  danger: "border border-border-primary text-accent-red hover:bg-accent-red-light",
};

// Touch targets stay at least 44px tall at `md`; `sm` is for inline controls
// that sit beside text and are never the only way to do something.
const SIZES: Record<Size, string> = {
  sm: "min-h-8 px-2.5 py-1 text-xs",
  md: "min-h-11 px-4 py-2 text-sm",
};

withDefaults(
  defineProps<{
    variant?: Variant;
    size?: Size;
    type?: "button" | "submit";
    disabled?: boolean;
    loading?: boolean;
    block?: boolean;
    /** Render as something else — a link, say. */
    as?: string | Component;
    /** Style the single child element instead of rendering a wrapper. */
    asChild?: boolean;
  }>(),
  { variant: "secondary", size: "md", type: "button", as: "button" },
);
</script>
