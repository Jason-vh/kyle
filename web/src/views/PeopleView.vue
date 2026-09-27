<template>
  <AppPage>
    <PageHeader title="People" subtitle="Everyone with a Kyle account" />

    <AppNotice
      v-if="message && !selected"
      :tone="message.kind === 'error' ? 'red' : 'green'"
      class="mb-3"
    >
      {{ message.text }}
    </AppNotice>

    <QueryState :loading="isPending" :error="error" :empty="people.length === 0">
      <template #loading>
        <div class="flex flex-col gap-2">
          <AppCard v-for="row in 4" :key="row">
            <div class="flex items-center gap-3">
              <Skeleton class="size-8 shrink-0 rounded-full" />
              <div class="min-w-0 flex-1 space-y-2">
                <Skeleton class="h-3.5 w-1/3" />
                <Skeleton class="h-3 w-1/2" />
              </div>
            </div>
          </AppCard>
        </div>
      </template>
      <template #empty>Nobody has an account yet.</template>

      <div class="stagger flex flex-col gap-2">
        <UserRow v-for="person in people" :key="person.id" :user="person" @open="open(person)" />
      </div>
    </QueryState>

    <BottomSheet
      :open="selected !== null"
      :title="selected?.displayName ?? ''"
      description="Rename, unlink, merge or delete this person"
      @update:open="close"
    >
      <template v-if="selected">
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
          <p v-if="selected.identities.length === 0" class="text-sm text-text-muted">
            No linked accounts.
          </p>
          <ul class="divide-y divide-border-primary">
            <li
              v-for="identity in selected.identities"
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
        </section>

        <section class="mt-6">
          <SectionHeading title="Merge someone in" />
          <p class="mb-2 text-sm text-text-muted">
            Their accounts and history move to {{ selected.displayName }}, and they are removed.
          </p>
          <ul class="flex flex-col gap-1.5">
            <li v-for="other in others" :key="other.id">
              <button
                type="button"
                class="w-full rounded-control border px-3 py-2 text-left transition-colors"
                :class="
                  mergeFrom?.id === other.id
                    ? 'border-accent-purple bg-accent-purple/5'
                    : 'border-border-primary hover:bg-bg-elevated'
                "
                :aria-pressed="mergeFrom?.id === other.id"
                @click="pickMerge(other)"
              >
                <span class="block text-sm font-medium text-text-primary">
                  {{ other.displayName }}
                </span>
                <span class="block truncate text-xs text-text-muted">
                  {{ signInSummary(other) }} · {{ historySummary(other.footprint) }}
                </span>
              </button>
            </li>
          </ul>

          <div v-if="mergeFrom" class="mt-3">
            <p class="mb-1.5 text-sm text-text-secondary">Keep the name</p>
            <div class="flex gap-2">
              <AppButton
                v-for="candidate in nameCandidates"
                :key="candidate"
                size="sm"
                :variant="mergeName === candidate ? 'primary' : 'secondary'"
                :aria-pressed="mergeName === candidate"
                @click="mergeName = candidate"
              >
                {{ candidate }}
              </AppButton>
            </div>
            <AppButton variant="primary" block class="mt-3" @click="confirming = 'merge'">
              Merge {{ mergeFrom.displayName }} into {{ selected.displayName }}
            </AppButton>
          </div>
        </section>

        <section v-if="deletable" class="mt-6">
          <SectionHeading title="Delete" />
          <p class="mb-2 text-sm text-text-muted">
            {{ selected.displayName }} has no history, so nothing is lost.
          </p>
          <AppButton variant="danger" block @click="confirming = 'delete'">
            Delete {{ selected.displayName }}
          </AppButton>
        </section>
      </template>
    </BottomSheet>

    <ConfirmDialog
      :open="confirming !== null"
      :title="confirmTitle"
      :description="confirmDescription"
      :confirm-label="confirming === 'merge' ? 'Merge' : 'Delete'"
      :busy-label="confirming === 'merge' ? 'Merging…' : 'Deleting…'"
      :busy="merging || deleting"
      @update:open="confirming = null"
      @confirm="onConfirm"
    />
  </AppPage>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useTitle } from "@vueuse/core";
import type { AdminUser } from "#web/api/users";
import UserRow from "#web/components/UserRow.vue";
import AppButton from "#web/components/ui/AppButton.vue";
import AppCard from "#web/components/ui/AppCard.vue";
import AppInput from "#web/components/ui/AppInput.vue";
import AppNotice from "#web/components/ui/AppNotice.vue";
import AppPage from "#web/components/ui/AppPage.vue";
import BottomSheet from "#web/components/ui/BottomSheet.vue";
import ConfirmDialog from "#web/components/ui/ConfirmDialog.vue";
import PageHeader from "#web/components/ui/PageHeader.vue";
import QueryState from "#web/components/ui/QueryState.vue";
import SectionHeading from "#web/components/ui/SectionHeading.vue";
import Skeleton from "#web/components/ui/Skeleton.vue";
import {
  useDeleteUser,
  useMergeUsers,
  useRenameUser,
  useUnlinkIdentity,
  useUsers,
} from "#web/queries/users";
import { useSession } from "#web/queries/session";
import { hasHistory, historySummary, platformName, signInSummary } from "#web/utils/users";

useTitle("People — Kyle");

const { user: me } = useSession();
const { data, error, isPending } = useUsers();
const { mutateAsync: rename, isLoading: renaming } = useRenameUser();
const { mutateAsync: merge, isLoading: merging } = useMergeUsers();
const { mutateAsync: remove, isLoading: deleting } = useDeleteUser();
const { mutateAsync: unlink } = useUnlinkIdentity();

const people = computed(() => data.value ?? []);

const selectedId = ref<string | null>(null);
const selected = computed(
  () => people.value.find((person) => person.id === selectedId.value) ?? null,
);
const others = computed(() => people.value.filter((person) => person.id !== selectedId.value));

const name = ref("");
const mergeFrom = ref<AdminUser | null>(null);
const mergeName = ref("");
const unlinking = ref<string | null>(null);
const confirming = ref<"merge" | "delete" | null>(null);
const message = ref<{ kind: "error" | "success"; text: string } | null>(null);

const renamable = computed(() => {
  const trimmed = name.value.trim();
  return trimmed.length > 0 && trimmed !== selected.value?.displayName;
});

const deletable = computed(() => {
  if (!selected.value || selected.value.id === me.value?.id) return false;
  return !hasHistory(selected.value.footprint);
});

const nameCandidates = computed(() => {
  const names = [selected.value?.displayName, mergeFrom.value?.displayName];
  return [...new Set(names.filter((candidate) => candidate !== undefined))];
});

const confirmTitle = computed(() => {
  if (confirming.value === "delete") return `Delete ${selected.value?.displayName}?`;
  return `Merge ${mergeFrom.value?.displayName} into ${selected.value?.displayName}?`;
});

const confirmDescription = computed(() => {
  if (confirming.value === "delete") return "Their account is removed. This cannot be undone.";
  const from = mergeFrom.value;
  if (!from) return "";
  return `${historySummary(from.footprint)} and every linked account move over, the result is called ${mergeName.value}, and ${from.displayName}'s account is removed. This cannot be undone.`;
});

function open(person: AdminUser) {
  selectedId.value = person.id;
  name.value = person.displayName;
  mergeFrom.value = null;
  message.value = null;
}

function close() {
  selectedId.value = null;
  mergeFrom.value = null;
}

function pickMerge(person: AdminUser) {
  mergeFrom.value = person;
  mergeName.value = selected.value?.displayName ?? person.displayName;
}

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
  const person = selected.value;
  if (!person || !renamable.value) return;
  const displayName = name.value.trim();
  await attempt(() => rename({ id: person.id, displayName }), `Renamed to ${displayName}.`);
}

async function onUnlink(linkId: string) {
  const person = selected.value;
  if (!person) return;
  unlinking.value = linkId;
  await attempt(() => unlink({ userId: person.id, linkId }), "Account unlinked.");
  unlinking.value = null;
}

async function onConfirm() {
  const person = selected.value;
  if (!person) return;

  let done = false;
  if (confirming.value === "delete") {
    done = await attempt(() => remove(person.id), `Deleted ${person.displayName}.`);
  } else if (mergeFrom.value) {
    const from = mergeFrom.value;
    const displayName = mergeName.value;
    done = await attempt(
      () => merge({ from: from.id, into: person.id, displayName }),
      `Merged ${from.displayName} into ${displayName}.`,
    );
  }
  confirming.value = null;
  if (done) close();
}
</script>
