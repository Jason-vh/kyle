<template>
  <DrawerRoot :open="open" @update:open="emit('update:open', $event)">
    <DrawerPortal>
      <DrawerOverlay class="sheet-overlay fixed inset-0 z-20 bg-bg-overlay" />
      <DrawerContent
        class="sheet fixed inset-x-0 bottom-0 z-20 mx-auto flex max-h-[85dvh] w-full max-w-lg flex-col rounded-t-card border border-b-0 border-border-primary bg-bg-surface shadow-raised focus:outline-none"
      >
        <DrawerHandle class="mx-auto mt-2.5 h-1 w-9 shrink-0 rounded-full bg-border-secondary" />
        <DrawerTitle class="px-5 pt-3 text-base font-semibold text-text-primary">
          {{ title }}
        </DrawerTitle>
        <DrawerDescription class="sr-only">{{ description }}</DrawerDescription>

        <div class="flex-1 overflow-y-auto px-5 py-4">
          <slot />
        </div>

        <div
          v-if="$slots.footer"
          class="flex gap-2 border-t border-border-primary px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          <slot name="footer" />
        </div>
      </DrawerContent>
    </DrawerPortal>
  </DrawerRoot>
</template>

<script setup lang="ts">
import {
  DrawerContent,
  DrawerDescription,
  DrawerHandle,
  DrawerOverlay,
  DrawerPortal,
  DrawerRoot,
  DrawerTitle,
} from "reka-ui";

defineProps<{ open: boolean; title: string; description: string }>();

const emit = defineEmits<{ "update:open": [boolean] }>();
</script>

<style scoped>
.sheet {
  transform: translateY(var(--drawer-swipe-movement-y, 0px));
  transition: transform 0.3s cubic-bezier(0.32, 0.72, 0, 1);
}

.sheet[data-swiping] {
  transition: none;
}

.sheet[data-state="open"] {
  animation: sheet-in 0.35s cubic-bezier(0.32, 0.72, 0, 1);
}

.sheet[data-state="closed"] {
  animation: sheet-out 0.25s cubic-bezier(0.4, 0, 1, 1) forwards;
}

.sheet-overlay[data-state="open"] {
  animation: overlay-in 0.35s ease-out;
}

.sheet-overlay[data-state="closed"] {
  animation: overlay-in 0.25s ease-in reverse forwards;
}

@keyframes sheet-in {
  from {
    transform: translateY(100%);
  }
}

@keyframes sheet-out {
  to {
    transform: translateY(100%);
  }
}

@keyframes overlay-in {
  from {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .sheet,
  .sheet-overlay {
    animation: none;
    transition: none;
  }
}
</style>
