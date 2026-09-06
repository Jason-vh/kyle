<template>
  <!-- Scrolls sideways on a phone rather than wrapping into a wall of pills. -->
  <div class="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
    <button
      v-for="option in options"
      :key="option.value"
      class="min-h-8 shrink-0 rounded-full border px-3 py-1 text-xs font-semibold transition-colors"
      :class="
        option.value === modelValue
          ? 'border-accent-purple bg-accent-purple-light text-accent-purple'
          : 'border-border-primary text-text-muted hover:text-text-primary'
      "
      @click="emit('update:modelValue', option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<script setup lang="ts" generic="T extends string">
defineProps<{ modelValue: T; options: readonly { value: T; label: string }[] }>();

const emit = defineEmits<{ "update:modelValue": [T] }>();
</script>
