<template>
  <BottomSheet
    :open="open"
    :title="title"
    :description="`What else can be done with ${title}`"
    @update:open="emit('update:open', $event)"
  >
    <ul class="-mx-2 -mt-2">
      <li v-for="item in items" :key="item.label">
        <button
          type="button"
          :disabled="item.busy"
          class="flex min-h-12 w-full items-center gap-3.5 rounded-control px-2 text-left transition-colors hover:bg-bg-elevated disabled:opacity-50"
          :class="item.danger ? 'text-accent-red' : 'text-text-primary'"
          @click="item.run()"
        >
          <component
            :is="item.icon"
            class="size-5 shrink-0"
            :class="item.danger ? '' : 'text-text-secondary'"
            aria-hidden="true"
          />
          <span class="min-w-0 flex-1">
            <span class="block text-sm font-medium">{{ item.label }}</span>
            <span v-if="item.hint" class="block text-xs text-text-muted">{{ item.hint }}</span>
          </span>
        </button>
      </li>
    </ul>
    <p v-if="error" class="mt-2 text-xs text-accent-red">{{ error }}</p>
  </BottomSheet>
</template>

<script setup lang="ts">
import { computed, ref, type Component } from "vue";
import BottomSheet from "./ui/BottomSheet.vue";
import IconSearch from "~icons/ph/arrow-clockwise";
import IconTrash from "~icons/ph/trash";

export interface MenuItem {
  label: string;
  hint?: string;
  icon: Component;
  danger?: boolean;
  busy?: boolean;
  run: () => void;
}

const props = defineProps<{
  open: boolean;
  title: string;
  /** Look for it again; absent where there is nothing to look for. */
  search?: () => Promise<unknown>;
  /** What removing costs, when the viewer may remove it at all. */
  removal?: { label: string; hint?: string };
}>();

const emit = defineEmits<{ "update:open": [boolean]; remove: [] }>();

const searching = ref(false);
const error = ref("");

async function search() {
  if (!props.search) return;

  error.value = "";
  searching.value = true;
  try {
    await props.search();
    emit("update:open", false);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Could not search again";
  } finally {
    searching.value = false;
  }
}

const items = computed<MenuItem[]>(() => {
  const list: MenuItem[] = [];
  if (props.search) {
    list.push({ label: "Search again", icon: IconSearch, busy: searching.value, run: search });
  }
  if (props.removal) {
    list.push({
      label: props.removal.label,
      hint: props.removal.hint,
      icon: IconTrash,
      danger: true,
      run: () => {
        emit("remove");
        emit("update:open", false);
      },
    });
  }
  return list;
});
</script>
