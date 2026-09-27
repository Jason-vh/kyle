<template>
  <DialogRoot v-if="items.length" v-model:open="open">
    <DialogTrigger
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
    </DialogTrigger>

    <DialogPortal>
      <DialogContent
        class="notifications fixed inset-0 z-30 overflow-y-auto bg-bg-base focus:outline-none"
      >
        <div
          class="pointer-events-none absolute inset-x-0 top-0 h-64 overflow-hidden"
          aria-hidden="true"
        >
          <img
            v-if="hero"
            :src="hero"
            alt=""
            class="size-full scale-125 object-cover opacity-40 blur-2xl"
          />
          <div class="absolute inset-0 bg-gradient-to-b from-transparent to-bg-base" />
        </div>

        <header
          class="relative mx-auto flex max-w-page items-start gap-3 px-4 pt-6 pb-4 sm:px-6 sm:pt-10"
        >
          <div class="min-w-0 flex-1">
            <DialogTitle class="text-2xl font-semibold text-text-primary">
              Notifications
            </DialogTitle>
            <DialogDescription class="mt-0.5 text-sm text-text-muted">
              {{ unread > 0 ? `${unread} unread` : "All caught up" }}
            </DialogDescription>
          </div>

          <AppButton
            v-if="unread > 0"
            variant="secondary"
            size="sm"
            class="mt-1"
            :loading="markRead.isLoading.value"
            @click="markRead.mutateAsync()"
          >
            Mark all read
          </AppButton>
          <DialogClose as-child>
            <AppButton variant="ghost" size="icon" class="-mt-1 -mr-2" aria-label="Close">
              <IconX class="size-5" aria-hidden="true" />
            </AppButton>
          </DialogClose>
        </header>

        <div
          class="relative mx-auto max-w-page px-4 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-6"
        >
          <section v-for="day in days" :key="day.label" class="mb-6">
            <h2 class="mb-2 px-1 text-xs font-semibold tracking-wide text-text-muted uppercase">
              {{ day.label }}
            </h2>
            <ul class="stagger flex flex-col gap-2">
              <li v-for="item in day.items" :key="item.id">
                <component
                  :is="item.tmdbId ? RouterLink : 'div'"
                  v-bind="item.tmdbId ? { to: `/media/${item.mediaType}/${item.tmdbId}` } : {}"
                  class="flex items-center gap-3 rounded-card border border-border-primary bg-bg-surface p-3 no-underline transition-colors"
                  :class="item.tmdbId ? 'hover:bg-bg-elevated' : ''"
                  @click="item.tmdbId && (open = false)"
                >
                  <MediaPoster :src="item.posterUrl" :alt="item.title" size="md" />
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-sm font-semibold text-text-primary">
                      {{ item.title }}
                    </p>
                    <p class="text-sm text-text-secondary">{{ item.body }}</p>
                    <p class="mt-0.5 text-xs text-text-muted">
                      {{
                        day.label === "Today"
                          ? relativeTime(item.createdAt)
                          : timeOfDay(item.createdAt)
                      }}
                    </p>
                  </div>
                  <span
                    v-if="!item.read"
                    class="size-2 shrink-0 rounded-full bg-accent-purple"
                    role="img"
                    aria-label="Unread"
                  />
                </component>
              </li>
            </ul>
          </section>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { RouterLink } from "vue-router";
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogPortal,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
} from "reka-ui";
import { relativeTime } from "#web/composables/useRelativeTime";
import { useMarkNotificationsRead, useNotifications } from "#web/queries/notifications";
import { groupByDay, timeOfDay } from "#web/utils/notifications";
import AppButton from "#web/components/ui/AppButton.vue";
import MediaPoster from "#web/components/ui/MediaPoster.vue";
import IconBell from "~icons/ph/bell";
import IconX from "~icons/ph/x";

const open = ref(false);

const { data } = useNotifications();
const markRead = useMarkNotificationsRead();

const items = computed(() => data.value?.notifications ?? []);
const unread = computed(() => data.value?.unread ?? 0);
const days = computed(() => groupByDay(items.value));
const hero = computed(() => items.value.find((item) => item.posterUrl)?.posterUrl);
</script>

<style scoped>
.notifications[data-state="open"] {
  animation: rise-in 0.35s cubic-bezier(0.2, 0, 0, 1) both;
}

@media (prefers-reduced-motion: reduce) {
  .notifications[data-state="open"] {
    animation: none;
  }
}
</style>
