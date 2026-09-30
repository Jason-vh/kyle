<template>
  <div class="flex items-center justify-between" :class="size === 'sm' ? 'gap-2.5' : 'gap-4'">
    <div class="min-w-0">
      <Label
        :for="id"
        :class="size === 'sm' ? 'text-xs text-text-muted' : 'text-sm font-medium text-text-primary'"
      >
        {{ label }}
      </Label>
      <p v-if="description" class="text-xs text-text-muted">{{ description }}</p>
    </div>
    <SwitchRoot
      :id="id"
      :model-value="modelValue"
      :disabled="disabled"
      class="relative shrink-0 rounded-full bg-border-secondary transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-accent"
      :class="SIZES[size].track"
      @update:model-value="emit('update:modelValue', $event)"
    >
      <SwitchThumb
        class="block translate-x-0.5 rounded-full bg-white shadow-card transition-transform"
        :class="SIZES[size].thumb"
      />
    </SwitchRoot>
  </div>
</template>

<script setup lang="ts">
import { useId } from "vue";
import { Label, SwitchRoot, SwitchThumb } from "reka-ui";

type Size = "sm" | "md";

const SIZES: Record<Size, { track: string; thumb: string }> = {
  sm: { track: "h-5 w-9", thumb: "size-4 data-[state=checked]:translate-x-[1.125rem]" },
  md: { track: "h-7 w-12", thumb: "size-6 data-[state=checked]:translate-x-[1.375rem]" },
};

withDefaults(
  defineProps<{
    modelValue: boolean;
    label: string;
    description?: string;
    disabled?: boolean;
    /** `sm` sits beside a heading, where the switch is not the point of the row. */
    size?: Size;
  }>(),
  { size: "md" },
);

const emit = defineEmits<{ "update:modelValue": [boolean] }>();

const id = useId();
</script>
