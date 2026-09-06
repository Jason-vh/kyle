<template>
  <AlertDialogRoot :open="open" @update:open="emit('update:open', $event)">
    <AlertDialogPortal>
      <AlertDialogOverlay class="fixed inset-0 z-20 bg-bg-overlay" />
      <AlertDialogContent
        class="fixed inset-x-4 bottom-4 z-20 rounded-card border border-border-primary bg-bg-surface p-5 shadow-raised sm:inset-x-auto sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:w-[26rem] sm:-translate-x-1/2 sm:-translate-y-1/2"
      >
        <AlertDialogTitle class="text-base font-semibold text-text-primary">
          {{ title }}
        </AlertDialogTitle>
        <AlertDialogDescription class="mt-1 text-sm text-text-secondary">
          {{ description }}
        </AlertDialogDescription>

        <!-- Cancel first on a phone: it is the one a thumb reaches by accident. -->
        <div class="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <AlertDialogCancel as-child>
            <AppButton :disabled="busy">Cancel</AppButton>
          </AlertDialogCancel>
          <!-- Deliberately not AlertDialogAction, which closes on click: the
               caller decides when it is over, so `busy` means something. -->
          <AppButton variant="primary" :loading="busy" @click="emit('confirm')">
            {{ busy ? busyLabel : confirmLabel }}
          </AppButton>
        </div>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialogRoot>
</template>

<script setup lang="ts">
import {
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogRoot,
  AlertDialogTitle,
} from "reka-ui";
import AppButton from "./AppButton.vue";

/** Focus is trapped and Escape cancels, which `window.confirm` also did — the
 *  difference is that this one can say what is about to happen. */
withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    description: string;
    confirmLabel?: string;
    busyLabel?: string;
    busy?: boolean;
  }>(),
  { confirmLabel: "Confirm", busyLabel: "Working…" },
);

const emit = defineEmits<{ "update:open": [boolean]; confirm: [] }>();
</script>
