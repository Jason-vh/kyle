<template>
  <div class="flex min-h-screen flex-col">
    <!-- Header -->
    <header class="border-b border-border-primary bg-bg-surface px-4 py-3">
      <div class="mx-auto flex max-w-[800px] items-center gap-2.5">
        <router-link to="/" class="flex items-center gap-2.5 no-underline">
          <div
            class="flex size-8 items-center justify-center rounded-lg bg-accent-purple text-sm font-bold text-text-inverse"
          >
            K
          </div>
          <span class="text-base font-semibold text-text-primary">Kyle</span>
        </router-link>

        <nav v-if="user" class="ml-4 flex items-center gap-4">
          <router-link
            v-for="link in NAV_LINKS"
            :key="link.to"
            :to="link.to"
            class="text-sm no-underline transition-colors"
            :class="
              route.path.startsWith(link.to)
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

    <!-- Content -->
    <main class="flex-1">
      <RouterView />
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { RouterView, useRoute } from "vue-router";
import { getAuthStatus, type AuthUser } from "./api/auth";
import UserAvatar from "./components/UserAvatar.vue";

const NAV_LINKS = [
  { to: "/discover", label: "Request" },
  { to: "/requests", label: "Requests" },
  { to: "/threads", label: "Threads" },
];

const route = useRoute();
const user = ref<AuthUser | null>(null);

// Re-read on navigation so the header follows sign-in and sign-out.
watch(
  () => route.fullPath,
  async () => {
    user.value = (await getAuthStatus()).user ?? null;
  },
  { immediate: true },
);
</script>
