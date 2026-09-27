<template>
  <AppCard interactive class="relative">
    <div class="flex items-center gap-3">
      <UserAvatar :name="user.displayName" :src="user.avatarUrl" />

      <div class="min-w-0 flex-1">
        <router-link
          :to="`/people/${user.id}`"
          class="block truncate text-sm font-medium text-text-primary no-underline after:absolute after:inset-0 focus:outline-none"
        >
          {{ user.displayName }}
        </router-link>
        <p class="mt-0.5 truncate text-xs text-text-muted">{{ historySummary(user.footprint) }}</p>
      </div>

      <ul class="flex shrink-0 items-center gap-1.5 text-text-secondary">
        <li v-for="account in accounts" :key="account.key">
          <component
            :is="account.icon"
            class="size-4"
            role="img"
            :aria-label="account.label"
            :title="account.label"
          />
        </li>
      </ul>

      <StatusPill v-if="user.isAdmin" tone="purple">Admin</StatusPill>
    </div>
  </AppCard>
</template>

<script setup lang="ts">
import { computed, type Component } from "vue";
import type { AdminUser } from "#web/api/users";
import { historySummary, platformName } from "#web/utils/users";
import IconFingerprint from "~icons/ph/fingerprint";
import { PLATFORM_ICONS } from "./platform-icons";
import UserAvatar from "./UserAvatar.vue";
import AppCard from "./ui/AppCard.vue";
import StatusPill from "./ui/StatusPill.vue";

const props = defineProps<{ user: AdminUser }>();

interface Account {
  key: string;
  icon: Component;
  label: string;
}

const accounts = computed<Account[]>(() => {
  const linked = props.user.identities
    .filter((identity) => PLATFORM_ICONS[identity.platform])
    .map((identity) => ({
      key: identity.id,
      icon: PLATFORM_ICONS[identity.platform]!,
      label: `${platformName(identity.platform)}: ${identity.platformUsername ?? identity.platformUserId}`,
    }));

  const { passkeys } = props.user.footprint;
  if (passkeys === 0) return linked;
  const label = passkeys === 1 ? "1 passkey" : `${passkeys} passkeys`;
  return [...linked, { key: "passkeys", icon: IconFingerprint, label }];
});
</script>
