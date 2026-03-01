<template>
  <div class="flex min-h-screen items-center justify-center p-4">
    <div class="w-full max-w-sm rounded-lg border border-border-muted bg-bg-surface p-8">
      <h1 class="mb-6 text-center text-xl font-semibold">Kyle Thread Viewer</h1>
      <p v-if="error" class="mb-4 text-center text-sm text-accent-red">{{ error }}</p>
      <form @submit.prevent="onSubmit">
        <label for="token" class="mb-2 block text-sm text-text-secondary">Token</label>
        <input
          id="token"
          v-model="token"
          type="password"
          autofocus
          required
          class="w-full rounded-md border border-border-subtle bg-bg-input px-3 py-2 text-text-primary focus:border-accent-blue focus:outline-none"
        />
        <button
          type="submit"
          :disabled="loading"
          class="mt-4 w-full rounded-md border border-green-600 bg-green-700 px-4 py-2 text-white hover:bg-green-600 disabled:opacity-50"
        >
          {{ loading ? "Logging in…" : "Log in" }}
        </button>
      </form>
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
