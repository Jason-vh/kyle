<template>
  <div class="flex min-h-screen flex-col">
    <!-- Header -->
    <header class="border-b border-border-primary bg-bg-surface px-4 py-3">
      <div class="mx-auto flex max-w-[800px] items-center gap-2.5">
        <router-link to="/threads" class="flex items-center gap-2.5 no-underline">
          <div
            class="flex size-8 items-center justify-center rounded-lg bg-accent-purple text-sm font-bold text-text-inverse"
          >
            K
          </div>
          <span class="text-base font-semibold text-text-primary">Kyle</span>
        </router-link>
      </div>
    </header>

    <!-- Content -->
    <main class="flex-1">
      <RouterView />
    </main>
  </div>
</template>

<script setup lang="ts">
import { RouterView } from "vue-router";
</script>
