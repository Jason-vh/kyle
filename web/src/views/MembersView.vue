<template>
  <AppPage>
    <PageHeader title="Plex access" :subtitle="subtitle" />

    <form class="mb-3 flex gap-2" @submit.prevent="onInvite">
      <AppInput
        v-model="email"
        type="email"
        placeholder="Email address"
        label="Email address to invite"
        class="flex-1"
      />
      <AppButton variant="primary" type="submit" :loading="inviting" :disabled="!email.trim()">
        Invite
      </AppButton>
    </form>

    <p v-if="inviteError" role="alert" class="mb-3 text-sm text-accent-red">{{ inviteError }}</p>

    <QueryState :loading="isPending" :error="error" :empty="members.length === 0">
      <template #loading>
        <div class="flex flex-col gap-2">
          <AppCard v-for="row in 4" :key="row">
            <div class="flex items-center gap-3">
              <Skeleton class="size-8 shrink-0 rounded-full" />
              <div class="min-w-0 flex-1 space-y-2">
                <Skeleton class="h-3.5 w-1/3" />
                <Skeleton class="h-3 w-1/2" />
              </div>
              <Skeleton class="h-5 w-16 shrink-0 rounded-full" />
            </div>
          </AppCard>
        </div>
      </template>
      <template #empty>
        {{ isAdmin ? "Nobody has access yet." : "You have not invited anyone yet." }}
      </template>

      <div class="stagger flex flex-col gap-2">
        <MemberRow
          v-for="member in members"
          :key="member.id"
          :member="member"
          @remove="pendingRemoval = member"
        />
      </div>
    </QueryState>

    <ConfirmDialog
      :open="pendingRemoval !== null"
      :title="confirmTitle"
      :description="confirmDescription"
      confirm-label="Remove"
      :busy="removing"
      :error="removeError"
      @update:open="closeRemoval"
      @confirm="onRemove"
    />
  </AppPage>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useTitle } from "@vueuse/core";
import type { PlexMember } from "#web/api/plex";
import MemberRow from "#web/components/MemberRow.vue";
import AppButton from "#web/components/ui/AppButton.vue";
import AppCard from "#web/components/ui/AppCard.vue";
import AppInput from "#web/components/ui/AppInput.vue";
import AppPage from "#web/components/ui/AppPage.vue";
import ConfirmDialog from "#web/components/ui/ConfirmDialog.vue";
import PageHeader from "#web/components/ui/PageHeader.vue";
import QueryState from "#web/components/ui/QueryState.vue";
import Skeleton from "#web/components/ui/Skeleton.vue";
import { useInviteMember, useMembers, useRemoveMember } from "#web/queries/members";
import { useSession } from "#web/queries/session";

useTitle("Plex access — Kyle");

const { isAdmin } = useSession();

const subtitle = computed(() =>
  isAdmin.value ? "Who can watch, and who has been asked" : "The people you have invited",
);

const { data, error, isPending } = useMembers();
const { mutateAsync: sendInvite, isLoading: inviting } = useInviteMember();
const { mutateAsync: sendRemoval, isLoading: removing } = useRemoveMember();

const members = computed(() => data.value ?? []);

const email = ref("");
const inviteError = ref("");
const removeError = ref("");
const pendingRemoval = ref<PlexMember | null>(null);

const isPendingInvite = computed(() => pendingRemoval.value?.status === "pending");

const confirmTitle = computed(() =>
  isPendingInvite.value ? "Cancel this invitation?" : "Remove this person?",
);

const confirmDescription = computed(() => {
  const name = pendingRemoval.value?.name ?? "";
  if (isPendingInvite.value) return `${name} will no longer be able to accept the invitation.`;
  return `${name} will lose access to the Plex server.`;
});

async function onInvite() {
  const address = email.value.trim();
  if (!address) return;

  inviteError.value = "";
  try {
    await sendInvite(address);
    email.value = "";
  } catch (failure) {
    inviteError.value = (failure as Error).message;
  }
}

async function onRemove() {
  const member = pendingRemoval.value;
  if (!member) return;

  removeError.value = "";
  try {
    await sendRemoval(member.id);
    pendingRemoval.value = null;
  } catch (failure) {
    removeError.value = (failure as Error).message;
  }
}

function closeRemoval() {
  pendingRemoval.value = null;
  removeError.value = "";
}
</script>
