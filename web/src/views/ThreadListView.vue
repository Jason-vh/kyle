<template>
  <div class="mx-auto max-w-[700px] p-4 sm:p-8">
    <header class="mb-6">
      <div class="mb-4 flex items-baseline justify-between gap-4">
        <h1 class="text-xl font-semibold text-text-primary">Conversations</h1>
        <span class="text-sm text-text-muted">
          {{ filteredThreads.length }} conversation{{ filteredThreads.length !== 1 ? "s" : "" }}
        </span>
      </div>
    </header>

    <div class="mb-5">
      <input
        v-model="search"
        type="text"
        placeholder="Search conversations…"
        autocomplete="off"
        class="w-full rounded-lg border border-border-primary bg-bg-input px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent-purple focus:outline-none focus:ring-2 focus:ring-accent-purple/20"
      />
    </div>

    <div v-if="loading" class="py-12 text-center text-text-muted">Loading…</div>
    <div v-else-if="error" class="py-12 text-center text-accent-red">{{ error }}</div>
    <div v-else-if="filteredThreads.length === 0" class="py-12 text-center text-sm text-text-muted">
      No conversations found
    </div>
    <div v-else class="flex flex-col gap-1">
      <ThreadCard v-for="thread in filteredThreads" :key="thread.id" :thread="thread" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { getThreads } from "../api/threads";
import type { ThreadListItem } from "@shared/types";
import ThreadCard from "../components/ThreadCard.vue";

const threads = ref<ThreadListItem[]>([]);
const loading = ref(true);
const error = ref("");
const search = ref("");

const filteredThreads = computed(() => {
  const q = search.value.toLowerCase();
  if (!q) return threads.value;
  return threads.value.filter((t) => {
    const text = [t.preview, ...t.mediaRefs.map((r) => r.title)].join(" ").toLowerCase();
    return text.includes(q);
  });
});

onMounted(async () => {
  try {
    threads.value = await getThreads();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to load threads";
  } finally {
    loading.value = false;
  }
});
</script>
