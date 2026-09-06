<template>
  <PopoverRoot v-model:open="open">
    <PopoverTrigger
      class="relative flex size-9 items-center justify-center rounded-control text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary"
      :aria-label="unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'"
    >
      <svg class="size-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path
          d="M12 2a6 6 0 0 0-6 6v3.6l-1.7 3.4A1 1 0 0 0 5.2 17h13.6a1 1 0 0 0 .9-1.4L18 11.6V8a6 6 0 0 0-6-6Zm0 20a3 3 0 0 0 2.8-2H9.2a3 3 0 0 0 2.8 2Z"
        />
      </svg>
      <span
        v-if="unread > 0"
        class="absolute top-1.5 right-1.5 min-w-4 rounded-full bg-accent-purple px-1 text-[10px] leading-4 font-bold text-text-inverse"
      >
        {{ unread > 9 ? "9+" : unread }}
      </span>
    </PopoverTrigger>

    <PopoverPortal>
      <PopoverContent
        align="end"
        :side-offset="6"
        class="z-20 max-h-[70vh] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto rounded-card border border-border-primary bg-bg-surface shadow-raised"
      >
        <div
          class="flex items-center justify-between gap-3 border-b border-border-primary px-3.5 py-2.5"
        >
          <h2 class="text-sm font-semibold text-text-primary">Notifications</h2>
          <AppButton v-if="unread > 0" variant="ghost" size="sm" @click="markRead.mutate()">
            Mark all read
          </AppButton>
        </div>

        <QueryState
          :loading="isPending"
          :error="error"
          :empty="items.length === 0"
          empty-text="Nothing yet. You will hear when something you asked for arrives."
        >
          <template #loading>
            <div v-for="row in 3" :key="row" class="space-y-1.5 px-3.5 py-2.5">
              <Skeleton class="h-3.5 w-2/3" />
              <Skeleton class="h-3 w-full" />
            </div>
          </template>

          <ul class="divide-y divide-border-primary">
            <li
              v-for="item in items"
              :key="item.id"
              class="px-3.5 py-2.5"
              :class="item.read ? '' : 'bg-accent-purple-light/40'"
            >
              <p class="text-sm font-semibold text-text-primary">{{ item.title }}</p>
              <p class="text-xs text-text-secondary">{{ item.body }}</p>
              <p class="mt-0.5 text-xs text-text-muted">{{ relativeTime(item.createdAt) }}</p>
            </li>
          </ul>
        </QueryState>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from "reka-ui";
import { relativeTime } from "#web/composables/useRelativeTime";
import { useMarkNotificationsRead, useNotifications } from "#web/queries/notifications";
import AppButton from "#web/components/ui/AppButton.vue";
import QueryState from "#web/components/ui/QueryState.vue";
import Skeleton from "#web/components/ui/Skeleton.vue";

const open = ref(false);

const { data, error, isPending } = useNotifications();
const markRead = useMarkNotificationsRead();

const items = computed(() => data.value?.notifications ?? []);
const unread = computed(() => data.value?.unread ?? 0);
</script>
