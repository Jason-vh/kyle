<template>
  <div class="flex min-h-[80vh] items-center justify-center p-4">
    <div class="w-full max-w-sm">
      <div class="rule-top rule-bottom border-border-rule-light py-8">
        <h1 class="mb-1 text-center font-serif text-2xl font-bold">The Kyle Record</h1>
        <p class="font-ui mb-6 text-center text-xs tracking-wide text-text-muted">
          Thread Viewer Access
        </p>
        <p v-if="error" class="mb-4 text-center text-sm text-accent-red">{{ error }}</p>
        <form @submit.prevent="onSubmit">
          <label
            for="token"
            class="font-ui mb-2 block text-xs uppercase tracking-wide text-text-secondary"
          >
            Token
          </label>
          <input
            id="token"
            v-model="token"
            type="password"
            autofocus
            required
            class="font-ui w-full border-b border-border-muted bg-transparent px-1 py-2 text-text-primary focus:border-border-rule focus:outline-none"
          />
          <button
            type="submit"
            :disabled="loading"
            class="font-ui mt-6 w-full bg-bg-masthead px-4 py-2.5 text-sm font-semibold text-text-inverse transition-colors hover:bg-text-secondary disabled:opacity-50"
          >
            {{ loading ? "Logging in\u2026" : "Log in" }}
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
