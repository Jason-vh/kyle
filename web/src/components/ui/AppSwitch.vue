<template>
  <div class="flex items-center justify-between gap-4">
    <div class="min-w-0">
      <Label :for="id" class="text-sm font-medium text-text-primary">{{ label }}</Label>
      <p v-if="description" class="text-xs text-text-muted">{{ description }}</p>
    </div>
    <SwitchRoot
      :id="id"
      :model-value="modelValue"
      class="relative h-7 w-12 shrink-0 rounded-full bg-border-secondary transition-colors focus-visible:ring-2 focus-visible:ring-accent-purple/40 focus-visible:outline-none data-[state=checked]:bg-accent-purple"
      @update:model-value="emit('update:modelValue', $event)"
    >
      <SwitchThumb
        class="block size-6 translate-x-0.5 rounded-full bg-white shadow-card transition-transform data-[state=checked]:translate-x-[1.375rem]"
      />
    </SwitchRoot>
  </div>
</template>

<script setup lang="ts">
import { useId } from "vue";
import { Label, SwitchRoot, SwitchThumb } from "reka-ui";

defineProps<{ modelValue: boolean; label: string; description?: string }>();

const emit = defineEmits<{ "update:modelValue": [boolean] }>();

const id = useId();
</script>
