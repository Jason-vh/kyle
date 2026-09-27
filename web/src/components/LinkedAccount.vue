<template>
  <section class="p-4">
    <div class="flex items-center justify-between gap-4">
      <div class="flex items-center gap-3">
        <component
          :is="ICONS[platform]"
          class="size-4 shrink-0 text-text-secondary"
          aria-hidden="true"
        />
        <div>
          <p class="text-sm font-medium text-text-primary">{{ name }}</p>
          <p class="text-sm text-text-muted">{{ status }}</p>
        </div>
      </div>
      <AppButton v-if="identity" :loading="unlinking" @click="onUnlink">Unlink</AppButton>
      <AppButton v-else :loading="issuing" @click="onLink">
        {{ code ? "New code" : "Link" }}
      </AppButton>
    </div>

    <div v-if="code && !identity" class="mt-3 rounded-control bg-bg-elevated p-3">
      <p class="text-sm text-text-secondary">Send Kyle this message from {{ name }}:</p>
      <code class="mt-1.5 block font-mono text-base font-semibold text-text-primary select-all">
        link {{ code.code }}
      </code>
      <p class="mt-1.5 text-xs text-text-muted">
        Works once, for ten minutes. This page updates when it is done.
      </p>
    </div>

    <p v-if="error" class="mt-2 text-xs text-accent-red">{{ error }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch, type Component } from "vue";
import { useIntervalFn } from "@vueuse/core";
import { useQueryCache } from "@pinia/colada";
import type { LinkedIdentity } from "#shared/types";
import type { LinkCode } from "#web/api/links";
import { linksQuery, useCreateLinkCode, useUnlinkAccount } from "#web/queries/links";
import { platformName } from "#web/utils/users";
import IconDiscord from "~icons/cib/discord";
import IconSlack from "~icons/cib/slack";
import AppButton from "./ui/AppButton.vue";

const ICONS: Record<string, Component> = { slack: IconSlack, discord: IconDiscord };

const POLL_MS = 3000;

const props = defineProps<{ platform: string; identity?: LinkedIdentity }>();

const cache = useQueryCache();
const { mutateAsync: createCode, isLoading: issuing } = useCreateLinkCode();
const { mutateAsync: unlink, isLoading: unlinking } = useUnlinkAccount();

const code = ref<LinkCode | null>(null);
const error = ref("");

const name = computed(() => platformName(props.platform));

const status = computed(() => {
  const { identity } = props;
  if (!identity) return "Not linked";
  return `Linked as ${identity.platformUsername ?? identity.platformUserId}`;
});

const poll = useIntervalFn(
  () => {
    if (code.value && Date.parse(code.value.expiresAt) < Date.now()) code.value = null;
    cache.invalidateQueries({ key: linksQuery.key });
  },
  POLL_MS,
  { immediate: false },
);

watch(
  () => !!code.value && !props.identity,
  (waiting) => (waiting ? poll.resume() : poll.pause()),
);

async function onLink() {
  error.value = "";
  try {
    code.value = await createCode(props.platform);
  } catch (failure) {
    error.value = (failure as Error).message;
  }
}

async function onUnlink() {
  if (!props.identity) return;
  error.value = "";
  code.value = null;
  try {
    await unlink(props.identity.id);
  } catch (failure) {
    error.value = (failure as Error).message;
  }
}
</script>
