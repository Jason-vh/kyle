<template>
  <div>
    <BottomSheet
      :open="open"
      :title="person.displayName"
      description="Rename, unlink, merge or delete this person"
      @update:open="emit('update:open', $event)"
    >
      <AppNotice v-if="message" :tone="message.kind === 'error' ? 'red' : 'green'" class="mb-4">
        {{ message.text }}
      </AppNotice>

      <section>
        <SectionHeading title="Name" />
        <form class="flex gap-2" @submit.prevent="onRename">
          <AppInput v-model="name" type="text" label="Name" class="flex-1" />
          <AppButton type="submit" :loading="renaming" :disabled="!renamable">Save</AppButton>
        </form>
      </section>

      <section class="mt-6">
        <SectionHeading title="Accounts" />
        <p v-if="person.identities.length === 0" class="text-sm text-text-muted">
          No linked accounts.
        </p>
        <ul class="divide-y divide-border-primary">
          <li
            v-for="identity in person.identities"
            :key="identity.id"
            class="flex items-center gap-3 py-2"
          >
            <span class="min-w-0 flex-1 truncate text-sm text-text-primary">
              {{ platformName(identity.platform) }}
              <span class="text-text-muted">
                · {{ identity.platformUsername ?? identity.platformUserId }}
              </span>
            </span>
            <AppButton
              variant="danger"
              size="sm"
              :loading="unlinking === identity.id"
              @click="onUnlink(identity.id)"
            >
              Unlink
            </AppButton>
          </li>
        </ul>

        <template v-if="!hasPlex">
          <AppButton v-if="!choosingPlex" size="sm" class="mt-2" @click="choosingPlex = true">
            <IconPlex class="size-3.5 text-[#e5a00d]" aria-hidden="true" />
            Link Plex account
          </AppButton>

          <div v-else class="mt-3">
            <p class="mb-2 text-sm text-text-muted">
              Everyone the Plex server is shared with who is not linked to anyone yet.
            </p>
            <p v-if="loadingPlexAccounts" class="text-sm text-text-muted">Loading…</p>
            <p v-else-if="plexAccountsError" class="text-sm text-accent-red">
              {{ plexAccountsError.message }}
            </p>
            <p v-else-if="candidates.length === 0" class="text-sm text-text-muted">
              Every Plex account is already linked to someone.
            </p>
            <ul class="divide-y divide-border-primary">
              <li
                v-for="account in candidates"
                :key="account.accountId"
                class="flex items-center gap-3 py-2"
              >
                <UserAvatar :name="account.name" :src="account.thumb" />
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm font-medium text-text-primary">{{ account.name }}</p>
                  <p
                    v-if="account.username !== account.name"
                    class="truncate text-xs text-text-muted"
                  >
                    {{ account.username }}
                  </p>
                </div>
                <AppButton
                  size="sm"
                  :loading="linkingPlex === account.accountId"
                  @click="onLinkPlex(account)"
                >
                  Link
                </AppButton>
              </li>
            </ul>
          </div>
        </template>
      </section>

      <section class="mt-6">
        <SectionHeading title="Merge someone in" />
        <p class="mb-2 text-sm text-text-muted">
          Their accounts and history move to {{ person.displayName }}, and they are removed.
        </p>
        <ul class="divide-y divide-border-primary">
          <li v-for="other in others" :key="other.id" class="flex items-center gap-3 py-2">
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium text-text-primary">
                {{ other.displayName }}
              </p>
              <p class="truncate text-xs text-text-muted">
                {{ signInSummary(other) }} · {{ historySummary(other.footprint) }}
              </p>
            </div>
            <AppButton
              variant="ghost"
              size="icon"
              :aria-label="`Merge ${other.displayName} into ${person.displayName}`"
              :title="`Merge ${other.displayName} into ${person.displayName}`"
              @click="mergeFrom = other"
            >
              <IconUnite class="size-5" aria-hidden="true" />
            </AppButton>
          </li>
        </ul>
      </section>

      <section v-if="deletable" class="mt-6">
        <SectionHeading title="Delete" />
        <p class="mb-2 text-sm text-text-muted">
          {{ person.displayName }} has no history, so nothing is lost.
        </p>
        <AppButton variant="danger" block @click="confirmingDelete = true">
          Delete {{ person.displayName }}
        </AppButton>
      </section>
    </BottomSheet>

    <ConfirmDialog
      :open="mergeFrom !== null"
      :title="`Merge ${mergeFrom?.displayName} into ${person.displayName}?`"
      :description="mergeDescription"
      confirm-label="Merge"
      busy-label="Merging…"
      :busy="merging"
      @update:open="mergeFrom = null"
      @confirm="onMerge"
    />

    <ConfirmDialog
      :open="confirmingDelete"
      :title="`Delete ${person.displayName}?`"
      description="Their account is removed. This cannot be undone."
      confirm-label="Delete"
      busy-label="Deleting…"
      :busy="deleting"
      @update:open="confirmingDelete = false"
      @confirm="onDelete"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { AdminUser, LinkablePlexAccount } from "#web/api/users";
import UserAvatar from "./UserAvatar.vue";
import IconPlex from "~icons/cib/plex";
import AppButton from "./ui/AppButton.vue";
import AppInput from "./ui/AppInput.vue";
import AppNotice from "./ui/AppNotice.vue";
import BottomSheet from "./ui/BottomSheet.vue";
import ConfirmDialog from "./ui/ConfirmDialog.vue";
import SectionHeading from "./ui/SectionHeading.vue";
import {
  useDeleteUser,
  useLinkPlexAccount,
  useMergeUsers,
  usePlexAccounts,
  useRenameUser,
  useUnlinkIdentity,
} from "#web/queries/users";
import { useSession } from "#web/queries/session";
import { hasHistory, historySummary, platformName, signInSummary } from "#web/utils/users";
import IconUnite from "~icons/ph/unite";

const props = defineProps<{ open: boolean; person: AdminUser; people: AdminUser[] }>();

const emit = defineEmits<{ "update:open": [boolean]; deleted: [] }>();

const { user: me } = useSession();
const { mutateAsync: rename, isLoading: renaming } = useRenameUser();
const { mutateAsync: merge, isLoading: merging } = useMergeUsers();
const { mutateAsync: remove, isLoading: deleting } = useDeleteUser();
const { mutateAsync: unlink } = useUnlinkIdentity();
const { mutateAsync: linkPlex } = useLinkPlexAccount();

const others = computed(() => props.people.filter((other) => other.id !== props.person.id));

const name = ref(props.person.displayName);
const mergeFrom = ref<AdminUser | null>(null);
const unlinking = ref<string | null>(null);
const confirmingDelete = ref(false);
const choosingPlex = ref(false);
const linkingPlex = ref<string | null>(null);

const hasPlex = computed(() =>
  props.person.identities.some((identity) => identity.platform === "plex"),
);

const {
  data: plexAccounts,
  isPending: loadingPlexAccounts,
  error: plexAccountsError,
} = usePlexAccounts(() => props.open && choosingPlex.value && !hasPlex.value);
const candidates = computed(() => plexAccounts.value ?? []);
const message = ref<{ kind: "error" | "success"; text: string } | null>(null);

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    name.value = props.person.displayName;
    message.value = null;
    choosingPlex.value = false;
  },
);

const renamable = computed(() => {
  const trimmed = name.value.trim();
  return trimmed.length > 0 && trimmed !== props.person.displayName;
});

const deletable = computed(() => {
  if (props.person.id === me.value?.id) return false;
  return !hasHistory(props.person.footprint);
});

const mergeDescription = computed(() => {
  const from = mergeFrom.value;
  if (!from) return "";
  return `${historySummary(from.footprint)} and every linked account move to ${props.person.displayName}, and ${from.displayName}'s account is removed. This cannot be undone.`;
});

async function attempt(action: () => Promise<void>, success: string): Promise<boolean> {
  message.value = null;
  try {
    await action();
    message.value = { kind: "success", text: success };
    return true;
  } catch (failure) {
    message.value = { kind: "error", text: (failure as Error).message };
    return false;
  }
}

async function onRename() {
  if (!renamable.value) return;
  const displayName = name.value.trim();
  await attempt(() => rename({ id: props.person.id, displayName }), `Renamed to ${displayName}.`);
}

async function onUnlink(linkId: string) {
  unlinking.value = linkId;
  await attempt(() => unlink({ userId: props.person.id, linkId }), "Account unlinked.");
  unlinking.value = null;
}

async function onLinkPlex(account: LinkablePlexAccount) {
  linkingPlex.value = account.accountId;
  const done = await attempt(
    () => linkPlex({ userId: props.person.id, account }),
    `Linked ${account.username} to ${props.person.displayName}.`,
  );
  linkingPlex.value = null;
  if (done) choosingPlex.value = false;
}

async function onMerge() {
  const from = mergeFrom.value;
  if (!from) return;
  await attempt(
    () => merge({ from: from.id, into: props.person.id }),
    `Merged ${from.displayName} into ${props.person.displayName}.`,
  );
  mergeFrom.value = null;
}

async function onDelete() {
  const done = await attempt(() => remove(props.person.id), `Deleted ${props.person.displayName}.`);
  confirmingDelete.value = false;
  if (done) emit("deleted");
}
</script>
