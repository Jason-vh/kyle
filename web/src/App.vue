<template>
  <div class="flex min-h-screen flex-col">
    <header
      class="sticky top-0 z-10 border-b border-border-primary bg-bg-surface/90 backdrop-blur-sm"
    >
      <div class="mx-auto flex max-w-page items-center gap-3 px-4 py-2.5 sm:px-6">
        <router-link to="/" class="flex items-center gap-2.5 no-underline">
          <div
            class="flex size-8 items-center justify-center rounded-control bg-accent-purple text-sm font-bold text-text-inverse"
          >
            K
          </div>
          <span class="text-base font-semibold text-text-primary">Kyle</span>
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

        <router-link
          v-if="user"
          to="/account"
          class="ml-auto flex items-center gap-2 no-underline"
          :title="`Signed in as ${user.name}`"
        >
          <span class="hidden text-sm text-text-muted sm:inline">{{ user.name }}</span>
          <UserAvatar :name="user.name" />
        </router-link>
      </div>
    </header>

    <main class="flex-1">
      <RouterView />
    </main>

    <nav
      v-if="user"
      class="fixed inset-x-0 bottom-0 z-10 border-t border-border-primary bg-bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm sm:hidden"
    >
      <div class="flex">
        <router-link
          v-for="link in NAV_LINKS"
          :key="link.to"
          :to="link.to"
          class="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium no-underline transition-colors"
          :class="isActive(link.to) ? 'text-accent-purple' : 'text-text-muted'"
        >
          <NavIcon :name="link.icon" />
          {{ link.label }}
        </router-link>
      </div>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { RouterView, useRoute } from "vue-router";
import { getAuthStatus, type AuthUser } from "./api/auth";
import UserAvatar from "./components/UserAvatar.vue";
import NavIcon from "./components/ui/NavIcon.vue";
import { NAV_LINKS } from "./nav";

const route = useRoute();
const user = ref<AuthUser | null>(null);

const isActive = (to: string) => route.path.startsWith(to);

// Re-read on navigation so the header follows sign-in and sign-out.
watch(
  () => route.fullPath,
  async () => {
    user.value = (await getAuthStatus()).user ?? null;
  },
  { immediate: true },
);
</script>
