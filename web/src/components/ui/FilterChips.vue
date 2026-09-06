<template>
  <!-- Scrolls sideways on a phone rather than wrapping into a wall of pills. -->
  <ToggleGroupRoot
    type="single"
    :model-value="modelValue"
    :aria-label="label"
    class="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
    @update:model-value="onChange"
  >
    <ToggleGroupItem
      v-for="option in options"
      :key="option.value"
      :value="option.value"
      class="min-h-8 shrink-0 rounded-full border px-3 py-1 text-xs font-semibold transition-colors data-[state=off]:border-border-primary data-[state=off]:text-text-muted data-[state=on]:border-accent-purple data-[state=on]:bg-accent-purple-light data-[state=on]:text-accent-purple hover:data-[state=off]:text-text-primary"
    >
      {{ option.label }}
    </ToggleGroupItem>
  </ToggleGroupRoot>
</template>

<script setup lang="ts" generic="T extends string">
import { type AcceptableValue, ToggleGroupItem, ToggleGroupRoot } from "reka-ui";

defineProps<{
  modelValue: T;
  options: readonly { value: T; label: string }[];
  /** What the group filters, for anyone who cannot see the pills. */
  label: string;
}>();

const emit = defineEmits<{ "update:modelValue": [T] }>();

/**
 * A toggle group lets you turn the active item off, which would leave the list
 * filtered by nothing at all. One choice always stands.
 */
function onChange(value: AcceptableValue | AcceptableValue[]) {
  if (typeof value === "string") emit("update:modelValue", value as T);
}
</script>
