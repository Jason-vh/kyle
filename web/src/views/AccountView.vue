<template>
  <div class="mx-auto max-w-[700px] p-4 sm:p-8">
    <header class="mb-6">
      <h1 class="text-xl font-semibold text-text-primary">Account</h1>
      <p class="mt-1 text-sm text-text-muted">{{ user?.name }}</p>
    </header>

    <div
      v-if="message"
      class="mb-4 rounded-lg px-3 py-2 text-sm"
      :class="
        message.kind === 'error'
          ? 'bg-accent-red-light text-accent-red'
          : 'bg-accent-green-light text-accent-green'
      "
    >
      {{ message.text }}
    </div>

    <div class="divide-y divide-border-primary rounded-lg border border-border-primary">
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
        <button :disabled="busy" :class="buttonClass" @click="onTogglePlex">
          {{ user?.plexUsername ? "Disconnect" : "Connect" }}
        </button>
      </section>

      <section class="flex items-center justify-between gap-4 p-4">
        <div>
          <p class="text-sm font-medium text-text-primary">Passkey</p>
          <p class="text-sm text-text-muted">Add another device to sign in with</p>
        </div>
        <button :disabled="busy" :class="buttonClass" @click="onAddPasskey">Add passkey</button>
      </section>

      <section class="flex items-center justify-between gap-4 p-4">
        <div>
          <p class="text-sm font-medium text-text-primary">Session</p>
          <p class="text-sm text-text-muted">Sign out of Kyle on this device</p>
        </div>
        <button :disabled="busy" :class="buttonClass" @click="onLogout">Sign out</button>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useTitle } from "@vueuse/core";
import { useRoute, useRouter } from "vue-router";
import { getAuthStatus, logout, resetAuthCache, type AuthUser } from "../api/auth";
import { passkeyRegisterExisting } from "../api/passkey";
import { plexErrorMessage, startPlexLink, unlinkPlex } from "../api/plex";
import PlexIcon from "../components/PlexIcon.vue";

useTitle("Account — Kyle");

const buttonClass =
  "rounded-lg border border-border-primary px-3 py-1.5 text-sm font-semibold text-text-primary transition-colors hover:bg-bg-input disabled:opacity-50";

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
