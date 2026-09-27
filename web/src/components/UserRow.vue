<template>
  <AppCard interactive class="relative">
    <div class="flex items-center gap-3">
      <UserAvatar :name="user.displayName" />

      <div class="min-w-0 flex-1">
        <button
          type="button"
          class="block truncate text-left text-sm font-medium text-text-primary after:absolute after:inset-0 focus:outline-none"
          @click="emit('open')"
        >
          {{ user.displayName }}
        </button>
        <p class="mt-0.5 truncate text-xs text-text-muted">{{ signInSummary(user) }}</p>
        <p class="truncate text-xs text-text-muted">{{ historySummary(user.footprint) }}</p>
      </div>

      <StatusPill v-if="user.isAdmin" tone="purple">Admin</StatusPill>
    </div>
  </AppCard>
</template>

<script setup lang="ts">
import type { AdminUser } from "#web/api/users";
import { historySummary, signInSummary } from "#web/utils/users";
import UserAvatar from "./UserAvatar.vue";
import AppCard from "./ui/AppCard.vue";
import StatusPill from "./ui/StatusPill.vue";

defineProps<{ user: AdminUser }>();

const emit = defineEmits<{ open: [] }>();
</script>
