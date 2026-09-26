<template>
  <div class="pointer-events-none absolute inset-y-0 left-0 w-24" aria-hidden="true">
    <img
      v-if="src && !broken"
      :src="src"
      alt=""
      loading="lazy"
      class="fade size-full object-cover transition-opacity duration-300"
      :class="loaded ? 'opacity-100' : 'opacity-0'"
      @load="loaded = true"
      @error="broken = true"
    />
    <div v-else class="fade size-full bg-bg-elevated" />
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";

defineProps<{ src?: string | null }>();

const broken = ref(false);
const loaded = ref(false);
</script>

<style scoped>
.fade {
  mask-image: linear-gradient(to right, #000 30%, transparent);
}
</style>
