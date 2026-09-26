<template>
  <PopoverRoot v-if="items.length" v-model:open="open">
    <PopoverTrigger
      class="relative flex size-9 items-center justify-center rounded-control text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary"
      :aria-label="unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'"
    >
      <IconBell class="size-5" aria-hidden="true" />
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

        <ul class="stagger divide-y divide-border-primary">
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
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>

<script setup lang="ts">
import IconBell from "~icons/ph/bell";
import { computed, ref } from "vue";
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from "reka-ui";
import { relativeTime } from "#web/composables/useRelativeTime";
import { useMarkNotificationsRead, useNotifications } from "#web/queries/notifications";
import AppButton from "#web/components/ui/AppButton.vue";

const open = ref(false);

const { data } = useNotifications();
const markRead = useMarkNotificationsRead();

const items = computed(() => data.value?.notifications ?? []);
const unread = computed(() => data.value?.unread ?? 0);
</script>
