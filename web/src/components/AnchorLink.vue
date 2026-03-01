<template>
  <a
    :href="`#${anchor}`"
    class="cursor-pointer text-xs font-normal leading-none no-underline transition-all select-none"
    :class="copied ? 'text-accent-green !opacity-100' : 'text-text-muted hover:text-text-secondary'"
    @click.stop.prevent="copyLink"
    title="Copy link"
    >#</a
  >
</template>

<script setup lang="ts">
import { ref } from "vue";

const props = defineProps<{ anchor: string }>();

const copied = ref(false);

function copyLink() {
  const url = `${window.location.origin}${window.location.pathname}${window.location.search}#${props.anchor}`;
  navigator.clipboard.writeText(url).catch(() => {});
  history.replaceState(
    null,
    "",
    `${window.location.pathname}${window.location.search}#${props.anchor}`,
  );
  copied.value = true;
  setTimeout(() => {
    copied.value = false;
  }, 1500);
}
</script>
