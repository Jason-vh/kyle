<template>
  <AppPage>
    <PageHeader title="People" subtitle="Everyone with a Kyle account" />

    <QueryState :loading="isPending" :error="error" :empty="people.length === 0">
      <template #loading>
        <div class="flex flex-col gap-2">
          <AppCard v-for="row in 4" :key="row">
            <div class="flex items-center gap-3">
              <Skeleton class="size-8 shrink-0 rounded-full" />
              <div class="min-w-0 flex-1 space-y-2">
                <Skeleton class="h-3.5 w-1/3" />
                <Skeleton class="h-3 w-1/2" />
              </div>
            </div>
          </AppCard>
        </div>
      </template>
      <template #empty>Nobody has an account yet.</template>

      <div class="stagger flex flex-col gap-2">
        <UserRow v-for="person in people" :key="person.id" :user="person" />
      </div>
    </QueryState>
  </AppPage>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useTitle } from "@vueuse/core";
import UserRow from "#web/components/UserRow.vue";
import AppCard from "#web/components/ui/AppCard.vue";
import AppPage from "#web/components/ui/AppPage.vue";
import PageHeader from "#web/components/ui/PageHeader.vue";
import QueryState from "#web/components/ui/QueryState.vue";
import Skeleton from "#web/components/ui/Skeleton.vue";
import { useUsers } from "#web/queries/users";

useTitle("People — Kyle");

const { data, error, isPending } = useUsers();

const people = computed(() => data.value ?? []);
</script>
