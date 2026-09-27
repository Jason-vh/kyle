<template>
  <BottomSheet
    :open="open"
    :title="title"
    :description="`What else can be done with ${title}`"
    @update:open="onOpenChange"
  >
    <ul class="-mx-2 -mt-2">
      <li v-for="action in actions" :key="action.label">
        <button
          type="button"
          :disabled="busy !== ''"
          :aria-busy="busy === action.label || undefined"
          class="flex min-h-12 w-full items-center gap-3.5 rounded-control px-2 text-left transition-colors hover:bg-bg-elevated"
          :class="[
            action.danger ? 'text-accent-red' : 'text-text-primary',
            busy !== '' && busy !== action.label ? 'opacity-50' : '',
          ]"
          @click="run(action)"
        >
          <IconSpinner
            v-if="busy === action.label"
            class="size-5 shrink-0 animate-spin text-text-secondary"
            aria-hidden="true"
          />
          <component
            :is="action.icon"
            v-else
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
import IconSpinner from "~icons/ph/spinner-gap-bold";

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

function onOpenChange(open: boolean) {
  if (!open && busy.value) return;
  emit("update:open", open);
}

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
