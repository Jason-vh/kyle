<template>
  <AppPage>
    <PageHeader title="Requests">
      <template #aside>
        <AppButton v-if="isAdmin" variant="ghost" size="sm" @click="toggleScope">
          {{ showAll ? "Only mine" : "Everyone's" }}
        </AppButton>
      </template>
    </PageHeader>

    <QueryState :loading="isPending" :error="error" :empty="requests.length === 0">
      <template #loading><MediaRowSkeleton :count="4" /></template>

      <template #empty>
        Nothing requested yet.
        <router-link to="/discover" class="text-accent-purple hover:underline">
          Request something
        </router-link>
      </template>

      <div class="stagger flex flex-col gap-2">
        <RequestRow v-for="request in requests" :key="request.id" :request="request" />
      </div>
    </QueryState>
  </AppPage>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useTitle } from "@vueuse/core";
import MediaRowSkeleton from "#web/components/MediaRowSkeleton.vue";
import RequestRow from "#web/components/RequestRow.vue";
import AppButton from "#web/components/ui/AppButton.vue";
import AppPage from "#web/components/ui/AppPage.vue";
import PageHeader from "#web/components/ui/PageHeader.vue";
import QueryState from "#web/components/ui/QueryState.vue";
import { useRequests } from "#web/queries/media";
import { useSession } from "#web/queries/session";

useTitle("Requests — Kyle");

const showAll = ref(false);

const { isAdmin } = useSession();
// Switching scope is a different query, not a refetch of this one.
const { data, error, isPending } = useRequests(showAll);

const requests = computed(() => data.value ?? []);

function toggleScope() {
  showAll.value = !showAll.value;
}
</script>
