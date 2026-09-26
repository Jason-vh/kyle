<template>
  <AppPage>
    <QueryState :loading="isPending" :error="error">
      <template #loading>
        <div class="stagger">
          <Skeleton class="-mx-4 -mt-4 h-56 rounded-none sm:mx-0 sm:mt-0 sm:h-72 sm:rounded-card" />
          <div class="-mt-16 flex items-end gap-4 px-0.5">
            <Skeleton class="h-33 w-22 shrink-0 rounded-lg" />
            <div class="min-w-0 flex-1 space-y-2.5 pb-1">
              <Skeleton class="h-6 w-2/3" />
              <Skeleton class="h-3.5 w-1/2" />
            </div>
          </div>
          <Skeleton class="mt-5 h-28 w-full rounded-card" />
        </div>
      </template>

      <article v-if="media" class="stagger">
        <div :class="backdrop ? 'relative -mx-4 -mt-4 sm:mx-0 sm:mt-0' : 'mb-4'">
          <div v-if="backdrop" class="relative h-56 overflow-hidden sm:h-72 sm:rounded-card">
            <img :src="backdrop" alt="" class="size-full object-cover" />
            <!-- The title sits on the artwork, so the artwork fades into a floor for it. -->
            <div
              class="absolute inset-0 bg-gradient-to-b from-bg-base/40 via-transparent to-bg-base"
            />
          </div>

          <div
            class="flex items-center justify-between"
            :class="backdrop ? 'absolute inset-x-0 top-0 p-3' : ''"
          >
            <button type="button" :class="GLASS" aria-label="Back" @click="goBack">
              <IconBack class="size-5" aria-hidden="true" />
            </button>
            <button
              v-if="hasMenu"
              type="button"
              :class="GLASS"
              aria-label="More actions"
              @click="menuOpen = true"
            >
              <IconMore class="size-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        <header class="relative flex items-end gap-4" :class="backdrop ? '-mt-20' : ''">
          <MediaPoster :src="poster" :alt="media.title" size="xl" class="shadow-raised" />

          <div class="min-w-0 flex-1 pb-0.5">
            <h1 class="text-xl leading-tight font-semibold text-text-primary sm:text-2xl">
              {{ media.title }}
              <span v-if="media.year" class="font-normal text-text-secondary">
                {{ media.year }}
              </span>
            </h1>
            <p class="mt-1 text-sm text-text-secondary">{{ facts.join(" · ") }}</p>
          </div>
        </header>

        <div class="mt-5 flex flex-col gap-7">
          <div>
            <MediaStatus :media="media" @refresh="refetch()" />
            <p v-if="actionError" class="mt-2 text-sm text-accent-red">{{ actionError }}</p>
          </div>

          <section v-if="media.seasons?.length">
            <SectionHeading title="Seasons">
              <template v-if="followable" #aside>
                <AppSwitch
                  :model-value="following"
                  label="Follow new seasons"
                  size="sm"
                  :disabled="changingFollow || (following && !canUnfollow)"
                  @update:model-value="onFollow"
                />
              </template>
            </SectionHeading>
            <p v-if="followError" class="mb-2 text-xs text-accent-red">{{ followError }}</p>
            <SeasonList
              :seasons="media.seasons"
              :tmdb-id="media.tmdbId"
              :poster-path="media.posterPath"
              :service-id="media.library?.serviceId"
            />
          </section>

          <section v-if="media.overview">
            <SectionHeading title="About" />
            <p
              class="text-sm leading-relaxed text-text-secondary"
              :class="overviewOpen ? '' : 'line-clamp-3'"
            >
              {{ media.overview }}
            </p>
            <button
              v-if="!overviewOpen && media.overview.length > OVERVIEW_PREVIEW"
              type="button"
              class="mt-1 text-sm font-semibold text-text-primary"
              @click="overviewOpen = true"
            >
              More
            </button>
          </section>

          <section v-if="activity?.events.length">
            <SectionHeading title="Activity" />
            <AppNotice v-if="activity.unavailable.length" tone="amber" class="mb-3">
              {{ activity.unavailable.join(" and ") }} is unreachable, so downloads are missing.
            </AppNotice>
            <MediaActivityLog :events="activity.events" />
          </section>
        </div>

        <MediaMenu
          v-model:open="menuOpen"
          :title="media.title"
          :search="search"
          :removal="removal"
          @remove="confirming = true"
        />

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
import { formatDuration, formatSize } from "#web/utils/format";
import MediaActivityLog from "#web/components/MediaActivityLog.vue";
import MediaMenu from "#web/components/MediaMenu.vue";
import MediaStatus from "#web/components/MediaStatus.vue";
import SeasonList from "#web/components/SeasonList.vue";
import AppNotice from "#web/components/ui/AppNotice.vue";
import AppPage from "#web/components/ui/AppPage.vue";
import AppSwitch from "#web/components/ui/AppSwitch.vue";
import ConfirmDialog from "#web/components/ui/ConfirmDialog.vue";
import MediaPoster from "#web/components/ui/MediaPoster.vue";
import QueryState from "#web/components/ui/QueryState.vue";
import SectionHeading from "#web/components/ui/SectionHeading.vue";
import Skeleton from "#web/components/ui/Skeleton.vue";
import {
  useFollowSeries,
  useMediaActivity,
  useMediaDetail,
  useRemoveLibraryItem,
  useRetryRequest,
} from "#web/queries/media";
import { useSession } from "#web/queries/session";
import IconBack from "~icons/ph/arrow-left-bold";
import IconMore from "~icons/ph/dots-three-bold";

/** A round button that stays legible over whatever the artwork is. */
const GLASS =
  "flex size-10 items-center justify-center rounded-full border border-white/10 bg-bg-base/60 text-text-primary backdrop-blur-md transition-colors hover:bg-bg-base/80";

/** Roughly three lines on a phone; anything shorter has nothing more to show. */
const OVERVIEW_PREVIEW = 160;

const route = useRoute();
const router = useRouter();

const mediaType = computed(() => route.params.mediaType as LibraryMediaType);
const tmdbId = computed(() => Number(route.params.tmdbId));

const { data: media, error, isPending, refetch } = useMediaDetail(mediaType, tmdbId);
const { data: activity } = useMediaActivity(mediaType, tmdbId);
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
  const [genre] = item.genres;
  if (genre) parts.push(genre);
  if (item.rating) parts.push(`★\u00a0${item.rating.toFixed(1)}`);
  return parts;
});

const overviewOpen = ref(false);

const menuOpen = ref(false);

const retry = useRetryRequest();

/** Anything held can be looked for again; a service that is down cannot be asked. */
const search = computed(() => {
  const item = media.value;
  if (!item?.library || item.status?.state === "unknown") return undefined;
  return () => retry.mutateAsync({ mediaType: item.mediaType, tmdbId: item.tmdbId });
});

const canRemove = computed(
  () => !!media.value?.library && (isAdmin.value || media.value.requestedByMe),
);

const removal = computed(() => {
  const size = media.value?.library?.sizeOnDisk ?? 0;
  if (!canRemove.value) return undefined;
  return { label: "Remove", hint: size > 0 ? `Frees ${formatSize(size)}` : undefined };
});

const hasMenu = computed(() => !!search.value || !!removal.value);

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

/** Worth offering while something new is coming, and while it is on, so it can be turned off. */
const followable = computed(() => {
  const item = media.value;
  if (!item?.library || item.mediaType !== "series") return false;
  return item.continuing === true || item.following === true;
});

const changingFollow = ref(false);
const followError = ref("");
const followOverride = ref<boolean | null>(null);
const following = computed(() => followOverride.value ?? media.value?.following === true);

/** Starting is asking for more, which anyone may do; stopping is for whoever asked. */
const canUnfollow = computed(() => isAdmin.value || media.value?.requestedByMe === true);

const follow = useFollowSeries();

async function onFollow(value: boolean) {
  const library = media.value?.library;
  if (!library) return;

  followError.value = "";
  followOverride.value = value;
  changingFollow.value = true;
  try {
    await follow.mutateAsync({ serviceId: library.serviceId, follow: value });
  } catch (e) {
    followError.value = e instanceof Error ? e.message : "Could not change following";
  } finally {
    followOverride.value = null;
    changingFollow.value = false;
  }
}

function goBack() {
  if (window.history.state?.back) router.back();
  else router.push("/library");
}
</script>
