<template>
  <AppPage>
    <PageHeader :title="greeting" :subtitle="`Over the last ${data?.windowDays ?? 7} days`" />

    <QueryState :loading="isPending" :error="error">
      <template #loading>
        <section class="stagger mb-8 grid grid-cols-2 gap-2">
          <AppCard v-for="stat in 3" :key="stat" :class="stat === 3 ? 'col-span-2' : ''">
            <Skeleton class="h-7 w-28" />
            <Skeleton v-if="stat === 3" class="mt-2.5 h-1.5 w-full" />
          </AppCard>
        </section>

        <MediaRowSkeleton :count="3" size="sm" />
      </template>

      <AppNotice v-if="data?.unavailable.length" tone="amber" class="mb-4">
        {{ data.unavailable.join(" and ") }} could not be reached, so part of this is missing.
      </AppNotice>

      <!-- Storage takes a row of its own; it is the one that needs a bar. -->
      <section class="stagger mb-8 grid grid-cols-2 gap-2">
        <DashboardStat :value="watched" caption="watched" />
        <DashboardStat :value="downloads" caption="downloads" />
        <SpaceLeftCard v-if="storage" class="col-span-2" :storage="storage" />
        <DashboardStat v-else class="col-span-2" value="—" caption="space left" />
      </section>

      <section v-if="requests.length" class="mb-8">
        <SectionHeading title="Your requests" to="/requests" :count="requests.length" />
        <div class="stagger flex flex-col gap-2">
          <RequestRow v-for="request in requests" :key="request.id" :request="request" />
        </div>
      </section>

      <section>
        <SectionHeading title="Recently downloaded" />
        <QueryState :empty="activity.length === 0" empty-text="Nothing has arrived this week.">
          <div class="stagger flex flex-col gap-2">
            <ActivityRow v-for="item in activity" :key="item.id" :item="item" />
          </div>
        </QueryState>
      </section>
    </QueryState>
  </AppPage>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useTitle } from "@vueuse/core";
import { formatHours } from "#web/utils/format";
import ActivityRow from "#web/components/ActivityRow.vue";
import DashboardStat from "#web/components/DashboardStat.vue";
import MediaRowSkeleton from "#web/components/MediaRowSkeleton.vue";
import RequestRow from "#web/components/RequestRow.vue";
import SpaceLeftCard from "#web/components/SpaceLeftCard.vue";
import SectionHeading from "#web/components/ui/SectionHeading.vue";
import AppCard from "#web/components/ui/AppCard.vue";
import AppNotice from "#web/components/ui/AppNotice.vue";
import Skeleton from "#web/components/ui/Skeleton.vue";
import AppPage from "#web/components/ui/AppPage.vue";
import PageHeader from "#web/components/ui/PageHeader.vue";
import QueryState from "#web/components/ui/QueryState.vue";
import { useDashboard } from "#web/queries/media";
import { useSession } from "#web/queries/session";

useTitle("Kyle");

/** Requests worth glancing at; the rest live on their own page. */
const REQUEST_PREVIEW = 4;

const { data, error, isPending } = useDashboard();
const { user } = useSession();

const greeting = computed(() => {
  const first = user.value?.name.split(" ")[0];
  return first ? `Hey ${first}! Kyle here` : "Hey! Kyle here";
});

const requests = computed(() => (data.value?.requests ?? []).slice(0, REQUEST_PREVIEW));
const activity = computed(() => data.value?.activity ?? []);

const watched = computed(() => {
  const minutes = data.value?.stats.watchMinutes;
  return minutes === undefined ? "—" : formatHours(minutes);
});

const downloads = computed(() => {
  const { newMovies, newEpisodes } = data.value?.stats ?? {};
  if (newMovies === undefined || newEpisodes === undefined) return "—";
  return String(newMovies + newEpisodes);
});

const storage = computed(() => data.value?.stats.storage);
</script>
