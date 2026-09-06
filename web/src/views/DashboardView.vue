<template>
  <AppPage>
    <PageHeader :title="greeting" :subtitle="`The last ${data?.windowDays ?? 7} days`" />

    <QueryState :loading="loading" :error="error">
      <AppNotice v-if="data?.unavailable.length" tone="amber" class="mb-4">
        {{ data.unavailable.join(" and ") }} could not be reached, so part of this is missing.
      </AppNotice>

      <!-- Storage takes the full width on a phone; it is the one that needs a bar. -->
      <section class="mb-8 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <StatCard label="Watched" :value="watched" hint="across everyone" />
        <StatCard label="Arrived" :value="arrived" :hint="arrivedHint" />
        <StatCard
          class="col-span-2 sm:col-span-1"
          label="Space left"
          :value="spaceLeft"
          :hint="spaceHint"
          :tone="spaceTone"
          :fraction="spaceFraction"
        />
      </section>

      <section class="mb-8">
        <SectionHeading title="Your requests" to="/requests" :count="requests.length" />
        <QueryState :empty="requests.length === 0">
          <template #empty>
            Nothing on the way.
            <router-link to="/discover" class="text-accent-purple hover:underline">
              Request something
            </router-link>
          </template>
          <div class="flex flex-col gap-2">
            <RequestRow v-for="request in requests" :key="request.id" :request="request" />
          </div>
        </QueryState>
      </section>

      <section>
        <SectionHeading title="Just landed" />
        <QueryState :empty="activity.length === 0" empty-text="Nothing has arrived this week.">
          <div class="flex flex-col gap-2">
            <ActivityRow v-for="item in activity" :key="item.id" :item="item" />
          </div>
        </QueryState>
      </section>
    </QueryState>
  </AppPage>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useTitle } from "@vueuse/core";
import { getAuthStatus } from "../api/auth";
import { getDashboard, type DashboardResponse } from "../api/dashboard";
import { formatDuration, formatSize } from "../utils/format";
import ActivityRow from "../components/ActivityRow.vue";
import RequestRow from "../components/RequestRow.vue";
import SectionHeading from "../components/ui/SectionHeading.vue";
import AppNotice from "../components/ui/AppNotice.vue";
import AppPage from "../components/ui/AppPage.vue";
import PageHeader from "../components/ui/PageHeader.vue";
import QueryState from "../components/ui/QueryState.vue";
import StatCard from "../components/ui/StatCard.vue";

useTitle("Kyle");

/** Requests worth glancing at; the rest live on their own page. */
const REQUEST_PREVIEW = 4;

const data = ref<DashboardResponse | null>(null);
const name = ref("");
const loading = ref(true);
const error = ref("");

const greeting = computed(() => (name.value ? `Hey ${name.value.split(" ")[0]}` : "Home"));

const requests = computed(() => (data.value?.requests ?? []).slice(0, REQUEST_PREVIEW));
const activity = computed(() => data.value?.activity ?? []);

const watched = computed(() => {
  const minutes = data.value?.stats.watchMinutes;
  return minutes === undefined ? "—" : formatDuration(minutes);
});

const arrived = computed(() => {
  const { newMovies, newEpisodes } = data.value?.stats ?? {};
  if (newMovies === undefined || newEpisodes === undefined) return "—";
  return String(newMovies + newEpisodes);
});

const arrivedHint = computed(() => {
  const { newMovies, newEpisodes } = data.value?.stats ?? {};
  if (newMovies === undefined || newEpisodes === undefined) return undefined;
  return `${newMovies} films · ${newEpisodes} episodes`;
});

const storage = computed(() => data.value?.stats.storage);

const spaceLeft = computed(() => (storage.value ? formatSize(storage.value.freeBytes) : "—"));

const spaceHint = computed(() =>
  storage.value ? `of ${formatSize(storage.value.totalBytes)}` : undefined,
);

/** The bar fills as the disk does, so a full disk is a full red bar. */
const spaceFraction = computed(() => {
  if (!storage.value?.totalBytes) return undefined;
  return 1 - storage.value.freeBytes / storage.value.totalBytes;
});

const spaceTone = computed(() => {
  const used = spaceFraction.value;
  if (used === undefined) return "neutral";
  if (used >= 0.95) return "red";
  if (used >= 0.85) return "amber";
  return "green";
});

onMounted(async () => {
  name.value = (await getAuthStatus()).user?.name ?? "";
  try {
    data.value = await getDashboard();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Could not load the dashboard";
  } finally {
    loading.value = false;
  }
});
</script>
