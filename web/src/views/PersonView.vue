<template>
  <AppPage>
    <router-link
      to="/people"
      class="mb-3 inline-flex items-center gap-1 text-sm text-text-muted no-underline hover:text-text-primary"
    >
      <IconCaretLeft class="size-4" aria-hidden="true" />
      People
    </router-link>

    <QueryState :loading="isPending" :error="error">
      <template #loading>
        <div class="mb-6 flex items-center gap-4">
          <Skeleton class="size-16 shrink-0 rounded-full" />
          <div class="min-w-0 flex-1 space-y-2">
            <Skeleton class="h-5 w-1/3" />
            <Skeleton class="h-3.5 w-1/2" />
          </div>
        </div>
        <section class="mb-8 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <AppCard v-for="stat in 4" :key="stat">
            <Skeleton class="h-3 w-16" />
            <Skeleton class="mt-2 h-7 w-20" />
            <Skeleton class="mt-1.5 h-3 w-24" />
          </AppCard>
        </section>
        <MediaRowSkeleton :count="3" size="sm" />
      </template>

      <template v-if="profile && person">
        <header class="mb-6">
          <div class="flex items-center gap-4">
            <UserAvatar :name="person.displayName" :src="person.avatarUrl" size="lg" />

            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <h1 class="truncate text-xl font-semibold text-text-primary">
                  {{ person.displayName }}
                </h1>
                <StatusPill v-if="person.isAdmin" tone="accent">Admin</StatusPill>
              </div>
              <p class="mt-0.5 text-sm text-text-muted">{{ subtitle }}</p>
            </div>

            <AppButton size="sm" @click="managing = true">Manage</AppButton>
          </div>

          <ul v-if="accounts.length" class="mt-3 flex flex-wrap gap-1.5 sm:pl-20">
            <li
              v-for="account in accounts"
              :key="account.key"
              class="inline-flex items-center gap-1.5 rounded-full bg-bg-elevated px-2.5 py-1 text-xs text-text-secondary"
            >
              <component :is="account.icon" class="size-3.5" aria-hidden="true" />
              {{ account.label }}
            </li>
          </ul>
        </header>

        <AppNotice v-if="profile.unavailable.length" tone="amber" class="mb-4">
          {{ profile.unavailable.join(" and ") }} could not be reached, so part of this is missing.
        </AppNotice>

        <section class="stagger mb-8 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatCard
            label="Requests"
            :value="String(profile.requests.length)"
            :hint="requestsHint"
          />
          <StatCard
            label="Space"
            :value="profile.storage ? formatSize(profile.storage.requestedBytes) : '—'"
            :hint="spaceHint"
            :fraction="spaceFraction"
          />
          <StatCard label="Watched" :value="watchedValue" :hint="watchedHint" />
          <StatCard
            label="Chats"
            :value="String(person.footprint.conversations)"
            :hint="chatsHint"
          />
        </section>

        <section v-if="profile.requests.length" class="mb-8">
          <SectionHeading title="Requests">
            <template v-if="profile.requests.length > REQUEST_PREVIEW" #aside>
              <button
                type="button"
                class="text-xs font-semibold text-accent hover:underline"
                @click="showAllRequests = !showAllRequests"
              >
                {{ showAllRequests ? "Show fewer" : `Show all (${profile.requests.length})` }}
              </button>
            </template>
          </SectionHeading>
          <div class="stagger flex flex-col gap-2">
            <RequestRow v-for="request in shownRequests" :key="request.id" :request="request" />
          </div>
        </section>

        <section v-if="watched.length" class="mb-8">
          <SectionHeading title="Recently watched" />
          <div class="stagger flex flex-col gap-2">
            <ActivityRow v-for="item in watched" :key="item.id" :item="item" />
          </div>
        </section>

        <section v-if="profile.conversations.length" class="mb-8">
          <SectionHeading title="Conversations" />
          <AppCard :padded="false" class="px-1.5 py-0.5">
            <ThreadCard v-for="thread in profile.conversations" :key="thread.id" :thread="thread" />
          </AppCard>
        </section>

        <section v-if="events.length" class="mb-8">
          <SectionHeading title="Other activity" />
          <AppCard :padded="false" class="divide-y divide-border-primary">
            <div v-for="event in events" :key="event.key" class="flex items-center gap-3 px-4 py-3">
              <component
                :is="event.icon"
                class="size-4 shrink-0 text-text-muted"
                aria-hidden="true"
              />
              <p class="min-w-0 flex-1 truncate text-sm text-text-primary">
                {{ event.verb }}
                <router-link v-if="event.to" :to="event.to" class="font-medium">
                  {{ event.subject }}
                </router-link>
                <span v-else class="font-medium">{{ event.subject }}</span>
                <span v-if="event.note" class="text-text-muted"> · {{ event.note }}</span>
              </p>
              <time :datetime="event.at" class="shrink-0 text-xs text-text-muted tabular-nums">
                {{ relativeTime(event.at) }}
              </time>
            </div>
          </AppCard>
        </section>

        <p v-if="quiet" class="py-8 text-center text-sm text-text-muted">
          {{ person.displayName }} has not done anything in Kyle yet.
        </p>

        <PersonSheet
          v-model:open="managing"
          :person="person"
          :people="users ?? []"
          @deleted="router.push('/people')"
        />
      </template>
    </QueryState>
  </AppPage>
</template>

<script setup lang="ts">
import { computed, ref, type Component } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useTitle } from "@vueuse/core";
import type { ActivityItem } from "#shared/types";
import ActivityRow from "#web/components/ActivityRow.vue";
import MediaRowSkeleton from "#web/components/MediaRowSkeleton.vue";
import PersonSheet from "#web/components/PersonSheet.vue";
import RequestRow from "#web/components/RequestRow.vue";
import ThreadCard from "#web/components/ThreadCard.vue";
import UserAvatar from "#web/components/UserAvatar.vue";
import { PLATFORM_ICONS } from "#web/components/platform-icons";
import AppButton from "#web/components/ui/AppButton.vue";
import AppCard from "#web/components/ui/AppCard.vue";
import AppNotice from "#web/components/ui/AppNotice.vue";
import AppPage from "#web/components/ui/AppPage.vue";
import QueryState from "#web/components/ui/QueryState.vue";
import SectionHeading from "#web/components/ui/SectionHeading.vue";
import Skeleton from "#web/components/ui/Skeleton.vue";
import StatCard from "#web/components/ui/StatCard.vue";
import StatusPill from "#web/components/ui/StatusPill.vue";
import { useUserProfile, useUsers } from "#web/queries/users";
import { formatDate, formatSize } from "#web/utils/format";
import { relativeTime } from "#web/composables/useRelativeTime";
import { daysAgo } from "#web/utils/library";
import { platformName } from "#web/utils/users";
import IconCaretLeft from "~icons/ph/caret-left";
import IconEnvelope from "~icons/ph/envelope-simple";
import IconFingerprint from "~icons/ph/fingerprint";
import IconTrash from "~icons/ph/trash";

const REQUEST_PREVIEW = 5;

const route = useRoute();
const router = useRouter();

const id = computed(() => String(route.params.id));
const { data: profile, error, isPending } = useUserProfile(id);
const { data: users } = useUsers();

const person = computed(() => profile.value?.user);

useTitle(computed(() => `${person.value?.displayName ?? "Person"} — Kyle`));

const managing = ref(false);
const showAllRequests = ref(false);

function plural(total: number, noun: string): string {
  return `${total} ${noun}${total === 1 ? "" : "s"}`;
}

const subtitle = computed(() => {
  const parts = [`Joined ${formatDate(person.value?.createdAt ?? "")}`];
  const active = profile.value?.lastActiveAt;
  if (active) parts.push(`Active ${daysAgo(active)}`);
  return parts.join(" · ");
});

interface Account {
  key: string;
  icon: Component;
  label: string;
}

const accounts = computed<Account[]>(() => {
  const user = person.value;
  if (!user) return [];
  const linked = user.identities.map((identity) => ({
    key: identity.id,
    icon: PLATFORM_ICONS[identity.platform] ?? IconFingerprint,
    label: identity.platformUsername ?? platformName(identity.platform),
  }));
  const { passkeys } = user.footprint;
  if (passkeys === 0) return linked;
  return [
    ...linked,
    { key: "passkeys", icon: IconFingerprint, label: plural(passkeys, "passkey") },
  ];
});

const requestsHint = computed(() => {
  const watched = profile.value?.requestsWatched;
  if (!watched) return "Nothing asked for yet";
  return `${watched.watched} of ${watched.total} watched`;
});

const spaceFraction = computed(() => {
  const storage = profile.value?.storage;
  if (!storage || storage.libraryBytes === 0) return undefined;
  return storage.requestedBytes / storage.libraryBytes;
});

const spaceHint = computed(() => {
  const storage = profile.value?.storage;
  if (!storage) return "Library unavailable";
  if (storage.requestedBytes === 0) return "Nothing of theirs downloaded";
  const share = Math.round((spaceFraction.value ?? 0) * 100);
  return `${share < 1 ? "<1" : share}% of the library`;
});

const watchedValue = computed(() => String(profile.value?.watching?.titles ?? "—"));

const watchedHint = computed(() => {
  const watching = profile.value?.watching;
  if (!watching) return "No Plex account";
  if (watching.plays === 0) return "Nothing yet";
  return plural(watching.plays, "play");
});

const chatsHint = computed(() => {
  const messages = person.value?.footprint.messages ?? 0;
  return messages ? plural(messages, "message") : "Never chatted";
});

const shownRequests = computed(() => {
  const requests = profile.value?.requests ?? [];
  return showAllRequests.value ? requests : requests.slice(0, REQUEST_PREVIEW);
});

const watched = computed<ActivityItem[]>(() =>
  (profile.value?.watching?.recent ?? []).map((title) => ({
    id: `${title.mediaType}:${title.tmdbId ?? title.title}`,
    mediaType: title.mediaType,
    tmdbId: title.tmdbId,
    title: title.title,
    year: title.year,
    detail: title.detail,
    posterPath: title.posterPath,
    at: title.at,
    requestedBy: [],
    requestedByMe: false,
  })),
);

interface ActivityEvent {
  key: string;
  icon: Component;
  verb: string;
  subject: string;
  to?: string;
  note?: string;
  at: string;
}

const events = computed<ActivityEvent[]>(() => {
  const current = profile.value;
  if (!current) return [];

  const invites = current.invites.map((invite) => ({
    key: `invite:${invite.email}`,
    icon: IconEnvelope,
    verb: "Invited",
    subject: invite.email,
    at: invite.at,
  }));

  const removals = current.removals.map((removal) => ({
    key: `removal:${removal.mediaType}:${removal.tmdbId}`,
    icon: IconTrash,
    verb: "Removed",
    subject: removal.title,
    to: `/media/${removal.mediaType}/${removal.tmdbId}`,
    note: removal.deletedFiles ? "files deleted" : "files kept",
    at: removal.at,
  }));

  return [...invites, ...removals].sort((a, b) => b.at.localeCompare(a.at));
});

const quiet = computed(() => {
  const current = profile.value;
  if (!current) return false;
  return (
    current.requests.length === 0 &&
    watched.value.length === 0 &&
    current.conversations.length === 0 &&
    events.value.length === 0
  );
});
</script>
