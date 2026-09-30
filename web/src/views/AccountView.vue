<template>
  <AppPage>
    <PageHeader title="Account" :subtitle="user?.name" />

    <AppCard :padded="false" class="divide-y divide-border-primary">
      <section v-if="plexEnabled" class="p-4">
        <div class="flex items-center justify-between gap-4">
          <div class="flex items-center gap-3">
            <IconPlex class="size-4 shrink-0 text-[#e5a00d]" aria-hidden="true" />
            <div>
              <p class="text-sm font-medium text-text-primary">Plex</p>
              <p class="text-sm text-text-muted">
                {{ user?.plexUsername ? `Connected as ${user.plexUsername}` : "Not connected" }}
              </p>
            </div>
          </div>
          <AppButton :loading="busy === 'plex'" :disabled="busy !== null" @click="onTogglePlex">
            {{ user?.plexUsername ? "Disconnect" : "Connect" }}
          </AppButton>
        </div>
        <p v-if="errors.plex" role="alert" class="mt-2 text-sm text-accent-red">
          {{ errors.plex }}
        </p>
      </section>

      <LinkedAccount
        v-for="platform in links?.platforms ?? []"
        :key="platform"
        :platform="platform"
        :identity="links?.identities.find((identity) => identity.platform === platform)"
      />

      <router-link
        v-if="plexEnabled"
        to="/members"
        class="flex items-center justify-between gap-4 p-4 no-underline transition-colors hover:bg-bg-elevated focus:outline-none focus-visible:bg-bg-elevated"
      >
        <div>
          <p class="text-sm font-medium text-text-primary">Plex access</p>
          <p class="text-sm text-text-muted">Invite someone, and see who can watch</p>
        </div>
        <IconCaretRight class="size-4 shrink-0 text-text-muted" aria-hidden="true" />
      </router-link>

      <router-link
        v-if="isAdmin"
        to="/people"
        class="flex items-center justify-between gap-4 p-4 no-underline transition-colors hover:bg-bg-elevated focus:outline-none focus-visible:bg-bg-elevated"
      >
        <div>
          <p class="text-sm font-medium text-text-primary">People</p>
          <p class="text-sm text-text-muted">Rename, merge and tidy up accounts</p>
        </div>
        <IconCaretRight class="size-4 shrink-0 text-text-muted" aria-hidden="true" />
      </router-link>

      <section class="p-4">
        <div class="flex items-center justify-between gap-4">
          <div>
            <p class="text-sm font-medium text-text-primary">Passkey</p>
            <p class="text-sm text-text-muted">
              {{ passkeyAdded ? "Passkey added." : "Add another device to sign in with" }}
            </p>
          </div>
          <AppButton :loading="busy === 'passkey'" :disabled="busy !== null" @click="onAddPasskey">
            Add passkey
          </AppButton>
        </div>
        <p v-if="errors.passkey" role="alert" class="mt-2 text-sm text-accent-red">
          {{ errors.passkey }}
        </p>
      </section>

      <section class="p-4">
        <div class="flex items-center justify-between gap-4">
          <div>
            <p class="text-sm font-medium text-text-primary">Session</p>
            <p class="text-sm text-text-muted">Sign out of Kyle on this device</p>
          </div>
          <AppButton :loading="busy === 'logout'" :disabled="busy !== null" @click="onLogout">
            Sign out
          </AppButton>
        </div>
        <p v-if="errors.logout" role="alert" class="mt-2 text-sm text-accent-red">
          {{ errors.logout }}
        </p>
      </section>
    </AppCard>
  </AppPage>
</template>

<script setup lang="ts">
import { reactive, ref } from "vue";
import { useTitle } from "@vueuse/core";
import { useRoute, useRouter } from "vue-router";
import { logout } from "#web/api/auth";
import { isPasskeyCancelled, passkeyRegisterExisting } from "#web/api/passkey";
import { plexErrorMessage, startPlexLink, unlinkPlex } from "#web/api/plex";
import IconPlex from "~icons/cib/plex";
import IconCaretRight from "~icons/ph/caret-right";
import LinkedAccount from "#web/components/LinkedAccount.vue";
import AppButton from "#web/components/ui/AppButton.vue";
import AppCard from "#web/components/ui/AppCard.vue";
import AppPage from "#web/components/ui/AppPage.vue";
import PageHeader from "#web/components/ui/PageHeader.vue";
import { useSession, useSessionRefresh } from "#web/queries/session";
import { useAccountLinks } from "#web/queries/links";

useTitle("Account — Kyle");

const route = useRoute();
const router = useRouter();

const { user, plexEnabled, isAdmin } = useSession();
const refreshSession = useSessionRefresh();
const { data: links } = useAccountLinks();
type Action = "plex" | "passkey" | "logout";

const busy = ref<Action | null>(null);
const errors = reactive<Partial<Record<Action, string>>>({});
const passkeyAdded = ref(false);

if (route.query.error) errors.plex = plexErrorMessage(route.query.error);

async function run(key: Action, action: () => Promise<void>, fallback: string): Promise<void> {
  errors[key] = "";
  busy.value = key;
  try {
    await action();
  } catch (e) {
    errors[key] = e instanceof Error ? e.message : fallback;
  } finally {
    busy.value = null;
  }
}

async function onTogglePlex() {
  if (user.value?.plexUsername) {
    return run(
      "plex",
      async () => {
        await unlinkPlex();
        await refreshSession();
      },
      "Could not disconnect Plex",
    );
  }

  errors.plex = "";
  busy.value = "plex";
  try {
    await startPlexLink();
  } catch (e) {
    errors.plex = e instanceof Error ? e.message : "Could not start Plex sign-in";
    busy.value = null;
  }
}

async function onAddPasskey() {
  return run(
    "passkey",
    async () => {
      try {
        await passkeyRegisterExisting();
        passkeyAdded.value = true;
      } catch (e) {
        if (!isPasskeyCancelled(e)) throw e;
      }
    },
    "Could not add a passkey",
  );
}

async function onLogout() {
  return run(
    "logout",
    async () => {
      await logout();
      await refreshSession();
      await router.push("/login");
    },
    "Could not sign out",
  );
}
</script>
