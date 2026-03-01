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
        <form @submit.prevent="onSubmit">
          <label for="token" class="mb-2 block text-sm font-medium text-text-secondary">
            Token
          </label>
          <input
            id="token"
            v-model="token"
            type="password"
            autofocus
            required
            class="w-full rounded-lg border border-border-primary bg-bg-input px-3 py-2 text-text-primary focus:border-accent-purple focus:outline-none focus:ring-2 focus:ring-accent-purple/20"
          />
          <button
            type="submit"
            :disabled="loading"
            class="mt-4 w-full rounded-lg bg-accent-purple px-4 py-2.5 text-sm font-semibold text-text-inverse transition-colors hover:bg-accent-purple/90 disabled:opacity-50"
          >
            {{ loading ? "Signing in\u2026" : "Sign in" }}
          </button>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { login } from "../api/auth";

const router = useRouter();
const token = ref("");
const error = ref("");
const loading = ref(false);

async function onSubmit() {
  error.value = "";
  loading.value = true;
  try {
    const success = await login(token.value);
    if (success) {
      await router.push("/threads");
    } else {
      error.value = "Invalid token";
    }
  } catch {
    error.value = "Login failed";
  } finally {
    loading.value = false;
  }
}
</script>
