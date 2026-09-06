<template>
  <AppPage>
    <AppButton variant="ghost" size="sm" class="mb-3 -ml-2.5" @click="goBack">← Back</AppButton>

    <QueryState :loading="isPending" :error="error">
      <template #loading>
        <div class="stagger">
          <Skeleton class="mb-4 h-40 w-full rounded-card sm:h-56" />
          <div class="flex gap-4">
            <Skeleton class="h-27 w-18 shrink-0 rounded-lg" />
            <div class="min-w-0 flex-1 space-y-2.5">
              <Skeleton class="h-6 w-2/3" />
              <Skeleton class="h-3.5 w-1/2" />
              <Skeleton class="h-5 w-24 rounded-full" />
            </div>
          </div>
          <Skeleton class="mt-4 h-16 w-full" />
        </div>
      </template>

      <article v-if="media" class="stagger">
        <div
          v-if="backdrop"
          class="relative mb-4 overflow-hidden rounded-card border border-border-primary"
        >
          <img :src="backdrop" :alt="media.title" class="h-40 w-full object-cover sm:h-56" />
          <!-- The title sits on the artwork, so the artwork needs a floor to sit on. -->
          <div class="absolute inset-0 bg-gradient-to-t from-bg-base to-transparent" />
        </div>

        <header class="flex gap-4">
          <MediaPoster :src="poster" :alt="media.title" size="lg" />

          <div class="min-w-0 flex-1">
            <h1 class="text-xl font-semibold text-text-primary">
              {{ media.title }}
              <span v-if="media.year" class="font-normal text-text-muted">{{ media.year }}</span>
            </h1>
            <p class="mt-1 text-sm text-text-muted">{{ facts.join(" · ") }}</p>
            <p v-if="media.tagline" class="mt-1 text-sm text-text-secondary italic">
              {{ media.tagline }}
            </p>

            <div class="mt-2 flex flex-wrap items-center gap-2">
              <StatusPill :tone="status.tone">{{ status.label }}</StatusPill>
              <StatusPill v-if="media.requestedByMe" tone="purple">Yours</StatusPill>
              <StatusPill v-if="media.library && !media.library.monitored">Unmonitored</StatusPill>
            </div>
          </div>
        </header>

        <DownloadProgress
          v-if="media.progress !== undefined"
          :progress="media.progress"
          :eta="media.eta"
          class="mt-4"
        />

        <AppNotice v-if="media.unavailable.length" tone="amber" class="mt-4">
          {{ media.unavailable.join(" and ") }} is unreachable, so what we hold of this is unknown.
        </AppNotice>

        <p v-if="media.overview" class="mt-4 text-sm leading-relaxed text-text-secondary">
          {{ media.overview }}
        </p>

        <AppCard class="mt-4">
          <dl class="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div v-if="media.library">
              <dt class="text-xs text-text-muted">On disk</dt>
              <dd class="text-text-primary">{{ formatSize(media.library.sizeOnDisk) }}</dd>
            </div>
            <div v-if="media.library?.detail">
              <dt class="text-xs text-text-muted">Episodes</dt>
              <dd class="text-text-primary">{{ media.library.detail }}</dd>
            </div>
            <div v-if="media.status">
              <dt class="text-xs text-text-muted">Status</dt>
              <dd class="text-text-primary">{{ media.status }}</dd>
            </div>
            <div v-if="media.requestedBy.length">
              <dt class="text-xs text-text-muted">Requested by</dt>
              <dd class="text-text-primary">{{ formatNames(media.requestedBy) }}</dd>
            </div>
            <div v-if="media.watchedBy.length">
              <dt class="text-xs text-text-muted">Watched by</dt>
              <dd><WatcherAvatars :watchers="media.watchedBy" /></dd>
            </div>
          </dl>
        </AppCard>

        <div class="mt-4 flex flex-wrap items-start gap-2">
          <RequestAction v-if="!media.library" :item="media" />

          <AppButton
            v-if="isAdmin && media.library"
            variant="danger"
            :loading="removing"
            @click="confirming = true"
          >
            {{ removing ? "Removing…" : "Remove" }}
          </AppButton>
        </div>

        <p v-if="actionError" class="mt-2 text-sm text-accent-red">{{ actionError }}</p>

        <template v-if="media.seasons?.length">
          <SectionHeading title="Seasons" class="mt-6" />
          <SeasonList :seasons="media.seasons" />
        </template>

        <ConfirmDialog
          v-model:open="confirming"
          title="Remove from the library?"
          :description="confirmText"
          confirm-label="Remove"
          busy-label="Removing…"
          :busy="removing"
          @confirm="onRemove"
        />
      </article>
    </QueryState>
  </AppPage>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useTitle } from "@vueuse/core";
import type { LibraryMediaType } from "#shared/types";
import { backdropUrl, posterUrl } from "#web/utils/images";
import { formatDuration, formatNames, formatSize } from "#web/utils/format";
import DownloadProgress from "#web/components/DownloadProgress.vue";
import RequestAction from "#web/components/RequestAction.vue";
import SeasonList from "#web/components/SeasonList.vue";
import WatcherAvatars from "#web/components/WatcherAvatars.vue";
import AppButton from "#web/components/ui/AppButton.vue";
import AppCard from "#web/components/ui/AppCard.vue";
import AppNotice from "#web/components/ui/AppNotice.vue";
import AppPage from "#web/components/ui/AppPage.vue";
import ConfirmDialog from "#web/components/ui/ConfirmDialog.vue";
import MediaPoster from "#web/components/ui/MediaPoster.vue";
import QueryState from "#web/components/ui/QueryState.vue";
import SectionHeading from "#web/components/ui/SectionHeading.vue";
import Skeleton from "#web/components/ui/Skeleton.vue";
import StatusPill from "#web/components/ui/StatusPill.vue";
import type { Tone } from "#web/components/ui/types";
import { useMediaDetail, useRemoveLibraryItem } from "#web/queries/media";
import { useSession } from "#web/queries/session";

const route = useRoute();
const router = useRouter();

const mediaType = computed(() => route.params.mediaType as LibraryMediaType);
const tmdbId = computed(() => Number(route.params.tmdbId));

const { data: media, error, isPending } = useMediaDetail(mediaType, tmdbId);
const { isAdmin } = useSession();

useTitle(() => (media.value ? `${media.value.title} — Kyle` : "Kyle"));

const poster = computed(() => posterUrl(media.value?.posterPath ?? null));
const backdrop = computed(() => backdropUrl(media.value?.backdropPath ?? null));

/** The one-line summary under the title, skipping whatever TMDB does not know. */
const facts = computed(() => {
  const item = media.value;
  if (!item) return [];

  const parts = [item.mediaType === "movie" ? "Movie" : "Series"];
  if (item.runtime) parts.push(formatDuration(item.runtime));
  if (item.genres.length) parts.push(item.genres.slice(0, 3).join(", "));
  if (item.rating) parts.push(`★ ${item.rating.toFixed(1)}`);
  return parts;
});

/** What we have of it, which is a different question from what TMDB says it is. */
const status = computed<{ label: string; tone: Tone }>(() => {
  const item = media.value;
  if (!item) return { label: "Unknown", tone: "neutral" };
  if (item.progress !== undefined) return { label: "Downloading", tone: "amber" };
  if (!item.library) return { label: "Not in the library", tone: "neutral" };
  if (item.library.availability === "available") return { label: "Complete", tone: "green" };
  if (item.library.availability === "partial") return { label: "Partial", tone: "amber" };
  return { label: "Missing", tone: "red" };
});

const confirmText = computed(() => {
  const item = media.value;
  if (!item?.library) return "";
  const size =
    item.library.sizeOnDisk > 0 ? ` and delete ${formatSize(item.library.sizeOnDisk)}` : "";
  return `This removes “${item.title}” from the library${size}.`;
});

const removing = ref(false);
const confirming = ref(false);
const actionError = ref("");

// Removing changes the library, so the mutation refreshes this page with it.
const remove = useRemoveLibraryItem();

async function onRemove() {
  const library = media.value?.library;
  if (!library) return;

  actionError.value = "";
  confirming.value = false;
  removing.value = true;
  try {
    await remove.mutateAsync({ mediaType: mediaType.value, serviceId: library.serviceId });
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : "Could not remove this";
  } finally {
    removing.value = false;
  }
}

function goBack() {
  if (window.history.state?.back) router.back();
  else router.push("/library");
}
</script>
