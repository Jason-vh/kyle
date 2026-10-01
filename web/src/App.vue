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

    <TabBar v-if="user && !route.meta.hideNav" />
  </div>
</template>

<script setup lang="ts">
import { RouterView, useRoute } from "vue-router";
import NotificationBell from "./components/NotificationBell.vue";
import TabBar from "./components/TabBar.vue";
import UserAvatar from "./components/UserAvatar.vue";
import { isNavLinkActive, NAV_LINKS } from "./nav";
import { useSession } from "./queries/session";

const route = useRoute();
const { user } = useSession();

const isActive = (to: string) => isNavLinkActive(route.path, to);
</script>
