<template>
  <AppCard>
    <div class="flex items-center gap-3">
      <img
        v-if="member.thumb"
        :src="member.thumb"
        :alt="member.name"
        loading="lazy"
        class="size-8 shrink-0 rounded-full object-cover"
      />
      <UserAvatar v-else :name="member.name" />

      <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-medium text-text-primary">{{ member.name }}</p>
        <p v-if="detail" class="mt-0.5 truncate text-xs text-text-muted">{{ detail }}</p>
      </div>

      <StatusPill v-if="member.status !== 'member'" :tone="STATES[member.status].tone">
        {{ STATES[member.status].label }}
      </StatusPill>

      <AppButton v-if="member.canRemove" variant="danger" size="sm" @click="emit('remove')">
        {{ member.status === "pending" ? "Cancel" : "Remove" }}
      </AppButton>
    </div>
  </AppCard>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { PlexMember, PlexMemberStatus } from "#web/api/plex";
import UserAvatar from "./UserAvatar.vue";
import AppButton from "./ui/AppButton.vue";
import AppCard from "./ui/AppCard.vue";
import StatusPill from "./ui/StatusPill.vue";
import type { Tone } from "./ui/types";

const STATES: Record<PlexMemberStatus, { label: string; tone: Tone }> = {
  owner: { label: "Owner", tone: "purple" },
  member: { label: "Member", tone: "neutral" },
  pending: { label: "Invited", tone: "amber" },
};

const props = defineProps<{ member: PlexMember }>();

const emit = defineEmits<{ remove: [] }>();

const detail = computed(() => {
  const invitedBy = props.member.invitedBy ? `Invited by ${props.member.invitedBy}` : "";
  return [props.member.email, invitedBy].filter(Boolean).join(" · ");
});
</script>
