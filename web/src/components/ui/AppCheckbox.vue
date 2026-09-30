<template>
  <div class="flex items-center gap-3">
    <CheckboxRoot
      :id="id"
      :value="value"
      class="flex size-5 shrink-0 items-center justify-center rounded-md border border-border-secondary bg-bg-input transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none data-[state=checked]:border-accent data-[state=checked]:bg-accent"
    >
      <CheckboxIndicator class="text-text-inverse">
        <IconCheck class="size-3.5" aria-hidden="true" />
      </CheckboxIndicator>
    </CheckboxRoot>
    <div class="min-w-0 flex-1">
      <Label :for="id" class="block text-sm font-medium text-text-primary">{{ label }}</Label>
      <p v-if="description" class="text-xs text-text-muted">{{ description }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useId } from "vue";
import { CheckboxIndicator, CheckboxRoot, Label, type AcceptableValue } from "reka-ui";
import IconCheck from "~icons/ph/check-bold";

/** One choice in a `CheckboxGroupRoot`, which holds what is checked. */
defineProps<{ value: AcceptableValue; label: string; description?: string }>();

const id = useId();
</script>
