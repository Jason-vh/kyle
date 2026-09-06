<template>
  <div>
    <!-- The design carries the label in the placeholder; a screen reader cannot
         read a placeholder, so it gets a real one either way. -->
    <VisuallyHidden as-child>
      <Label :for="id">{{ label ?? placeholder }}</Label>
    </VisuallyHidden>
    <input
      :id="id"
      :value="modelValue"
      :type="type"
      :placeholder="placeholder"
      autocomplete="off"
      class="min-h-11 w-full rounded-control border border-border-primary bg-bg-input px-3 py-2 text-base text-text-primary placeholder-text-muted transition-colors focus:border-accent-purple focus:ring-2 focus:ring-accent-purple/20 focus:outline-none sm:text-sm"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
  </div>
</template>

<script setup lang="ts">
import { useId } from "vue";
import { Label, VisuallyHidden } from "reka-ui";

// 16px on phones: anything smaller makes iOS Safari zoom the page on focus.
withDefaults(
  defineProps<{ modelValue: string; type?: string; placeholder?: string; label?: string }>(),
  { type: "search" },
);

const emit = defineEmits<{ "update:modelValue": [string] }>();

const id = useId();
</script>
