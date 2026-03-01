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

        <template v-if="state === 'loading'">
          <p class="text-center text-sm text-text-muted">Validating invite...</p>
        </template>

        <template v-else-if="state === 'invalid'">
          <h1 class="mb-1 text-center text-xl font-semibold">Invalid Invite</h1>
          <p class="mb-4 text-center text-sm text-text-muted">{{ error }}</p>
          <router-link
            to="/login"
            class="block text-center text-sm text-accent-purple hover:underline"
          >
            Go to login
          </router-link>
        </template>

        <template v-else-if="state === 'ready'">
          <h1 class="mb-1 text-center text-xl font-semibold">Welcome, {{ displayName }}</h1>
          <p class="mb-6 text-center text-sm text-text-muted">Set up a passkey to access Kyle</p>
          <div
            v-if="error"
            class="mb-4 rounded-lg bg-accent-red-light px-3 py-2 text-center text-sm text-accent-red"
          >
            {{ error }}
          </div>
          <button
            :disabled="registering"
            class="w-full rounded-lg bg-accent-purple px-4 py-2.5 text-sm font-semibold text-text-inverse transition-colors hover:bg-accent-purple/90 disabled:opacity-50"
            @click="onRegister"
          >
            {{ registering ? "Setting up\u2026" : "Create passkey" }}
          </button>
        </template>

        <template v-else-if="state === 'done'">
          <h1 class="mb-1 text-center text-xl font-semibold">You're all set</h1>
          <p class="text-center text-sm text-text-muted">Redirecting...</p>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { resetAuthCache } from "../api/auth";
import { validateInvite, redeemInvite } from "../api/invites";

const route = useRoute();
const router = useRouter();

const state = ref<"loading" | "invalid" | "ready" | "done">("loading");
const displayName = ref("");
const error = ref("");
const registering = ref(false);

onMounted(async () => {
  const code = route.params.code as string;
  try {
    const invite = await validateInvite(code);
    displayName.value = invite.displayName;
    state.value = "ready";
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Invalid invite";
    state.value = "invalid";
  }
});

async function onRegister() {
  error.value = "";
  registering.value = true;
  try {
    const code = route.params.code as string;
    resetAuthCache();
    await redeemInvite(code);
    state.value = "done";
    setTimeout(() => router.push("/threads"), 500);
  } catch (e) {
    // User cancelled the passkey popup — just reset, don't show an error
    if (e instanceof DOMException && e.name === "NotAllowedError") return;
    error.value = e instanceof Error ? e.message : "Registration failed";
  } finally {
    registering.value = false;
  }
}
</script>
