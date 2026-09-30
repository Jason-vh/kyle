<template>
  <div class="flex min-h-screen flex-col">
    <header v-if="!route.meta.hideNav" class="px-3 pt-3 sm:pt-4">
      <div
        class="mx-auto flex h-header max-w-page items-center gap-3 rounded-card border border-border-primary bg-bg-surface px-4 shadow-raised"
      >
        <router-link
          to="/"
          class="flex size-8 items-center justify-center rounded-control bg-accent text-sm font-bold text-text-inverse no-underline"
          aria-label="Kyle home"
        >
          K
        </router-link>

        <!-- Phones get these as a tab bar instead, within reach of a thumb. -->
        <nav v-if="user" class="ml-3 hidden items-center gap-4 sm:flex">
          <router-link
            v-for="link in NAV_LINKS"
            :key="link.to"
            :to="link.to"
            class="text-sm no-underline transition-colors"
            :class="
              isActive(link.to)
                ? 'font-semibold text-text-primary'
                : 'text-text-muted hover:text-text-primary'
            "
          >
            {{ link.label }}
          </router-link>
        </nav>

        <div v-if="user" class="ml-auto flex items-center gap-1">
          <NotificationBell />
        </div>

        <router-link
          v-if="user"
          to="/account"
          class="flex items-center no-underline"
          :title="`Signed in as ${user.name}`"
          :aria-label="`Signed in as ${user.name}`"
        >
          <UserAvatar :name="user.name" :src="user.avatarUrl" />
        </router-link>
      </div>
    </header>

    <main class="flex-1">
      <RouterView />
    </main>

    <!--
      A capsule narrower than the cards, so it reads as a control and not as
      another row. It stays clear of the bottom edge: iOS Safari tints the area
      under its toolbar after any fixed element that touches it.
    -->
    <nav
      v-if="user && !route.meta.hideNav"
      class="fixed inset-x-0 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-10 mx-auto flex w-[min(20rem,calc(100%-3rem))] rounded-full bg-bg-elevated/85 p-1 shadow-float backdrop-blur-xl backdrop-saturate-150 sm:hidden"
    >
      <router-link
        v-for="link in NAV_LINKS"
        :key="link.to"
        :to="link.to"
        class="flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[11px] font-medium no-underline transition-colors"
        :class="isActive(link.to) ? 'text-accent' : 'text-text-muted'"
      >
        <component
          :is="isActive(link.to) ? link.activeIcon : link.icon"
          class="size-6"
          aria-hidden="true"
        />
        {{ link.label }}
      </router-link>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { RouterView, useRoute } from "vue-router";
import NotificationBell from "./components/NotificationBell.vue";
import UserAvatar from "./components/UserAvatar.vue";
import { NAV_LINKS } from "./nav";
import { useSession } from "./queries/session";

const route = useRoute();
const { user } = useSession();

const isActive = (to: string) => route.path.startsWith(to);
</script>
