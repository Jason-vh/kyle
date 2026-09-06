<template>
  <AppPage>
    <PageHeader title="Account" :subtitle="user?.name" />

    <AppNotice v-if="message" :tone="message.kind === 'error' ? 'red' : 'green'" class="mb-4">
      {{ message.text }}
    </AppNotice>

    <AppCard :padded="false" class="divide-y divide-border-primary">
      <section v-if="plexEnabled" class="flex items-center justify-between gap-4 p-4">
        <div class="flex items-center gap-3">
          <PlexIcon class="text-[#e5a00d]" />
          <div>
            <p class="text-sm font-medium text-text-primary">Plex</p>
            <p class="text-sm text-text-muted">
              {{ user?.plexUsername ? `Connected as ${user.plexUsername}` : "Not connected" }}
            </p>
          </div>
        </div>
        <AppButton :disabled="busy" @click="onTogglePlex">
          {{ user?.plexUsername ? "Disconnect" : "Connect" }}
        </AppButton>
      </section>

      <section class="flex items-center justify-between gap-4 p-4">
        <div>
          <p class="text-sm font-medium text-text-primary">Passkey</p>
          <p class="text-sm text-text-muted">Add another device to sign in with</p>
        </div>
        <AppButton :disabled="busy" @click="onAddPasskey">Add passkey</AppButton>
      </section>

      <section class="flex items-center justify-between gap-4 p-4">
        <div>
          <p class="text-sm font-medium text-text-primary">Session</p>
          <p class="text-sm text-text-muted">Sign out of Kyle on this device</p>
        </div>
        <AppButton :disabled="busy" @click="onLogout">Sign out</AppButton>
      </section>
    </AppCard>
  </AppPage>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useTitle } from "@vueuse/core";
import { useRoute, useRouter } from "vue-router";
import { getAuthStatus, logout, resetAuthCache, type AuthUser } from "../api/auth";
import { passkeyRegisterExisting } from "../api/passkey";
import { plexErrorMessage, startPlexLink, unlinkPlex } from "../api/plex";
import PlexIcon from "../components/PlexIcon.vue";
import AppButton from "../components/ui/AppButton.vue";
import AppCard from "../components/ui/AppCard.vue";
import AppNotice from "../components/ui/AppNotice.vue";
import AppPage from "../components/ui/AppPage.vue";
import PageHeader from "../components/ui/PageHeader.vue";

useTitle("Account — Kyle");

const route = useRoute();
const router = useRouter();

const user = ref<AuthUser | null>(null);
const plexEnabled = ref(false);
const busy = ref(false);
const message = ref<{ kind: "error" | "success"; text: string } | null>(null);

if (route.query.error) {
  message.value = { kind: "error", text: plexErrorMessage(route.query.error) };
} else if (route.query.linked === "plex") {
  message.value = { kind: "success", text: "Plex account connected." };
}

async function refresh() {
  resetAuthCache();
  const status = await getAuthStatus();
  user.value = status.user ?? null;
  plexEnabled.value = status.plexEnabled ?? false;
}

onMounted(refresh);

/** Wraps an action so failures surface as a message and the view stays consistent. */
async function run(action: () => Promise<void>, fallback: string) {
  message.value = null;
  busy.value = true;
  try {
    await action();
  } catch (e) {
    if (e instanceof DOMException && e.name === "NotAllowedError") return;
    message.value = { kind: "error", text: e instanceof Error ? e.message : fallback };
  } finally {
    busy.value = false;
  }
}

async function onTogglePlex() {
  if (!user.value?.plexUsername) {
    return run(startPlexLink, "Could not start Plex sign-in");
  }
  return run(async () => {
    await unlinkPlex();
    await refresh();
    message.value = { kind: "success", text: "Plex account disconnected." };
  }, "Could not disconnect Plex");
}

async function onAddPasskey() {
  return run(async () => {
    await passkeyRegisterExisting();
    message.value = { kind: "success", text: "Passkey added." };
  }, "Could not add a passkey");
}

async function onLogout() {
  return run(async () => {
    await logout();
    await router.push("/login");
  }, "Could not sign out");
}
</script>
