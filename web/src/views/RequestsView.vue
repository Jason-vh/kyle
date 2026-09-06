<template>
  <AppPage>
    <PageHeader title="Requests">
      <template #aside>
        <AppButton v-if="isAdmin" variant="ghost" size="sm" @click="toggleScope">
          {{ showAll ? "Only mine" : "Everyone's" }}
        </AppButton>
      </template>
    </PageHeader>

    <QueryState :loading="loading" :error="error" :empty="requests.length === 0">
      <template #empty>
        Nothing requested yet.
        <router-link to="/discover" class="text-accent-purple hover:underline">
          Request something
        </router-link>
      </template>

      <div class="flex flex-col gap-2">
        <RequestRow v-for="request in requests" :key="request.id" :request="request" />
      </div>
    </QueryState>
  </AppPage>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useTitle } from "@vueuse/core";
import { getAuthStatus } from "#web/api/auth";
import { getRequests, type MediaRequest } from "#web/api/requests";
import RequestRow from "#web/components/RequestRow.vue";
import AppButton from "#web/components/ui/AppButton.vue";
import AppPage from "#web/components/ui/AppPage.vue";
import PageHeader from "#web/components/ui/PageHeader.vue";
import QueryState from "#web/components/ui/QueryState.vue";

useTitle("Requests — Kyle");

const requests = ref<MediaRequest[]>([]);
const loading = ref(true);
const error = ref("");
const isAdmin = ref(false);
const showAll = ref(false);

async function load() {
  loading.value = true;
  error.value = "";
  try {
    requests.value = await getRequests(showAll.value);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Could not load requests";
  } finally {
    loading.value = false;
  }
}

function toggleScope() {
  showAll.value = !showAll.value;
  void load();
}

onMounted(async () => {
  isAdmin.value = (await getAuthStatus()).user?.admin ?? false;
  await load();
});
</script>
