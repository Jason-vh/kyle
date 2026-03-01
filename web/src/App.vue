<template>
  <div class="flex min-h-screen flex-col">
    <!-- Masthead -->
    <header class="bg-bg-masthead px-4 py-4 text-center text-text-inverse sm:py-6">
      <router-link to="/threads" class="no-underline text-text-inverse">
        <h1 class="font-serif text-3xl font-bold tracking-tight sm:text-4xl">The Kyle Record</h1>
      </router-link>
      <p
        class="font-ui mt-1 hidden text-xs tracking-widest uppercase text-text-inverse/60 sm:block"
      >
        Your Plex Media Library — Monitored, Curated, Delivered
      </p>
      <div class="font-ui mt-2 text-[0.6875rem] tracking-wide text-text-inverse/40">
        {{ dateLine }}
      </div>
      <div class="rule-double mx-auto mt-3 max-w-[700px] border-text-inverse/20 sm:mt-4"></div>
    </header>

    <!-- Content -->
    <main class="flex-1">
      <RouterView />
    </main>

    <!-- Colophon -->
    <footer class="rule-top border-border-rule-light px-4 py-6 text-center">
      <p class="font-ui text-xs tracking-wide text-text-muted">
        The Kyle Record — An automated publication of your media library
      </p>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { RouterView } from "vue-router";

const dateLine = computed(() => {
  const d = new Date();
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
});
</script>
