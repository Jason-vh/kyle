<template>
  <div class="flex min-h-[80vh] items-center justify-center p-4">
    <div class="w-full max-w-sm">
      <div class="rounded-lg border border-border-primary bg-bg-surface p-8 shadow-sm">
        <div class="mb-6 flex justify-center">
          <div
            class="flex size-12 items-center justify-center rounded-lg bg-accent-purple text-lg font-bold text-text-inverse"
          >
            K
          </div>
        </div>
        <h1 class="mb-1 text-center text-xl font-semibold">Sign in</h1>
        <p class="mb-6 text-center text-sm text-text-muted">Access the thread viewer</p>
        <div
          v-if="error"
          class="mb-4 rounded-lg bg-accent-red-light px-3 py-2 text-center text-sm text-accent-red"
        >
          {{ error }}
        </div>
        <button
          :disabled="loading"
          class="w-full rounded-lg bg-accent-purple px-4 py-2.5 text-sm font-semibold text-text-inverse transition-colors hover:bg-accent-purple/90 disabled:opacity-50"
          @click="onPasskeyLogin"
        >
          {{ loading ? "Authenticating\u2026" : "Sign in with passkey" }}
        </button>

        <template v-if="plexEnabled">
          <div class="my-4 flex items-center gap-3">
            <span class="h-px flex-1 bg-border-primary" />
            <span class="text-xs text-text-muted">or</span>
            <span class="h-px flex-1 bg-border-primary" />
          </div>
          <button
            :disabled="loading"
            class="flex w-full items-center justify-center gap-2 rounded-lg border border-border-primary px-4 py-2.5 text-sm font-semibold text-text-primary transition-colors hover:bg-bg-input disabled:opacity-50"
            @click="onPlexLogin"
          >
            <PlexIcon class="text-[#e5a00d]" />
            Sign in with Plex
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useTitle } from "@vueuse/core";
import { useRoute, useRouter } from "vue-router";
import { isPlexEnabled, resetAuthCache } from "../api/auth";
import { passkeyLogin } from "../api/passkey";
import { plexErrorMessage, startPlexLogin } from "../api/plex";
import PlexIcon from "../components/PlexIcon.vue";

useTitle("Sign in — Kyle");

const route = useRoute();
const router = useRouter();
const error = ref(plexErrorMessage(route.query.error));
const loading = ref(false);
const plexEnabled = ref(false);

onMounted(async () => {
  plexEnabled.value = await isPlexEnabled();
});

async function onPlexLogin() {
  error.value = "";
  loading.value = true;
  try {
    await startPlexLogin();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Could not start Plex sign-in";
    loading.value = false;
  }
}

async function onPasskeyLogin() {
  error.value = "";
  loading.value = true;
  try {
    resetAuthCache();
    await passkeyLogin();
    await router.push("/threads");
  } catch (e) {
    // User cancelled the passkey popup — just reset, don't show an error
    if (e instanceof DOMException && e.name === "NotAllowedError") return;
    error.value = e instanceof Error ? e.message : "Login failed";
  } finally {
    loading.value = false;
  }
}
</script>
