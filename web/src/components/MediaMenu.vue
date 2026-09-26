<template>
  <BottomSheet
    :open="open"
    :title="title"
    :description="`What else can be done with ${title}`"
    @update:open="emit('update:open', $event)"
  >
    <ul class="-mx-2 -mt-2">
      <li v-for="action in actions" :key="action.label">
        <button
          type="button"
          :disabled="busy !== ''"
          class="flex min-h-12 w-full items-center gap-3.5 rounded-control px-2 text-left transition-colors hover:bg-bg-elevated disabled:opacity-50"
          :class="action.danger ? 'text-accent-red' : 'text-text-primary'"
          @click="run(action)"
        >
          <component
            :is="action.icon"
            class="size-5 shrink-0"
            :class="action.danger ? '' : 'text-text-secondary'"
            aria-hidden="true"
          />
          <span class="min-w-0 flex-1">
            <span class="block text-sm font-medium">{{ action.label }}</span>
            <span v-if="action.hint" class="block text-xs text-text-muted">{{ action.hint }}</span>
          </span>
        </button>
      </li>
    </ul>
    <p v-if="error" class="mt-2 text-xs text-accent-red">{{ error }}</p>
  </BottomSheet>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import type { MenuAction } from "./menu";
import BottomSheet from "./ui/BottomSheet.vue";

const props = defineProps<{ open: boolean; title: string; actions: MenuAction[] }>();

const emit = defineEmits<{ "update:open": [boolean] }>();

const busy = ref("");
const error = ref("");

// A fresh sheet has no leftover failure from the last time it was open.
watch(
  () => props.open,
  (open) => {
    if (open) error.value = "";
  },
);

/** The sheet closes once the action has done its part, and stays to say why if it could not. */
async function run(action: MenuAction) {
  error.value = "";
  busy.value = action.label;
  try {
    await action.run();
    emit("update:open", false);
  } catch (e) {
    error.value = e instanceof Error ? e.message : `Could not ${action.label.toLowerCase()}`;
  } finally {
    busy.value = "";
  }
}
</script>
