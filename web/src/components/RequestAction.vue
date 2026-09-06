<template>
  <div>
    <AppButton v-if="requested" variant="ghost" :size="size" disabled>Requested</AppButton>
    <AppButton v-else variant="primary" :size="size" :loading="busy" @click="onRequest">
      {{ label }}
    </AppButton>

    <p v-if="error" class="mt-1 text-xs text-accent-red">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import type { RequestInput } from "#web/api/requests";
import { useRequestMedia } from "#web/queries/media";
import AppButton from "./ui/AppButton.vue";

const props = withDefaults(
  defineProps<{
    item: RequestInput;
    /** Already in the library: asking again is allowed, but say so. */
    held?: boolean;
    size?: "sm" | "md";
  }>(),
  { size: "md" },
);

const busy = ref(false);
const requested = ref(false);
const error = ref("");

// Requesting changes the library, so the mutation refreshes everything that
// shows it — the page this button sits on included.
const request = useRequestMedia();

const label = computed(() => {
  if (busy.value) return "Requesting…";
  return props.held ? "Request anyway" : "Request";
});

async function onRequest() {
  error.value = "";
  busy.value = true;
  try {
    await request.mutateAsync(props.item);
    requested.value = true;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Could not request this";
  } finally {
    busy.value = false;
  }
}
</script>
