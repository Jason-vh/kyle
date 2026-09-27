<template>
  <AppPage>
    <div v-if="heading || isPending" class="stagger">
      <div :class="backdrop || isPending ? 'relative' : 'mb-4'">
        <div
          v-if="backdrop || isPending"
          class="relative h-56 overflow-hidden rounded-card sm:h-72"
        >
          <img v-if="backdrop" :src="backdrop" alt="" class="size-full object-cover" />
          <Skeleton v-else class="size-full rounded-none" />
          <!-- The title sits on the artwork, so the artwork fades into a floor for it. -->
          <div
            class="absolute inset-0 bg-gradient-to-b from-bg-base/40 via-transparent to-bg-base"
          />
        </div>

        <div
          class="flex items-center justify-between"
          :class="backdrop || isPending ? 'absolute inset-x-0 top-0 p-3' : ''"
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

      <header class="relative flex items-end gap-4" :class="backdrop || isPending ? '-mt-20' : ''">
        <MediaPoster
          v-if="heading"
          :path="heading.posterPath"
          :alt="heading.title"
          size="xl"
          class="shadow-raised"
        />
        <!-- Its own edge and shadow, so it reads as sitting on the artwork rather than part of it. -->
        <div
          v-else
          class="aspect-[2/3] w-22 shrink-0 overflow-hidden rounded-lg border border-border-primary bg-bg-surface shadow-raised"
        >
          <Skeleton class="size-full rounded-none" />
        </div>

        <div class="min-w-0 flex-1 pb-0.5">
          <h1
            v-if="heading"
            class="text-xl leading-tight font-semibold text-text-primary sm:text-2xl"
          >
            {{ heading.title }}
            <span v-if="heading.year" class="font-normal text-text-secondary">
              {{ heading.year }}
            </span>
          </h1>
          <Skeleton v-else class="h-6 w-3/5" />
          <p v-if="media" class="mt-1 text-sm text-text-secondary">{{ facts.join(" · ") }}</p>
          <Skeleton v-else class="mt-2.5 h-3.5 w-2/5" />
        </div>
      </header>
    </div>

    <QueryState :loading="isPending" :error="error">
      <template #loading>
        <div class="stagger">
          <AppCard :padded="false" class="mt-5 p-4">
            <div class="flex items-center gap-2.5">
              <Skeleton class="size-2 rounded-full" />
              <Skeleton class="h-4 w-24" />
              <Skeleton class="ml-auto h-3 w-16" />
            </div>
            <Skeleton class="mt-4 h-11 w-full rounded-control" />
          </AppCard>

          <div class="mt-7">
            <Skeleton class="mb-3.5 h-3.5 w-16" />
            <div class="space-y-2.5">
              <Skeleton class="h-3.5 w-full" />
              <Skeleton class="h-3.5 w-11/12" />
              <Skeleton class="h-3.5 w-3/5" />
            </div>
          </div>
        </div>
      </template>

      <article v-if="media" class="stagger">
        <div class="mt-5 flex flex-col gap-7">
          <MediaStatus v-if="showsStatus" :media="media" @refresh="refetch()" />

          <section v-if="media.overview">
            <SectionHeading title="About" />
            <p
              ref="overviewText"
              class="text-sm leading-relaxed text-text-secondary"
              :class="overviewOpen ? '' : 'line-clamp-2'"
            >
              {{ media.overview }}
            </p>
            <button
              v-if="!overviewOpen && overviewClamped"
              type="button"
              class="mt-1 text-sm font-semibold text-text-primary"
              @click="overviewOpen = true"
            >
              More
            </button>
          </section>

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
              :can-manage="canManage"
            />
          </section>

          <section v-if="activity?.events.length">
            <SectionHeading title="Activity" />
            <AppNotice v-if="activity.unavailable.length" tone="amber" class="mb-3">
              {{ activity.unavailable.join(" and ") }} is unreachable, so downloads are missing.
            </AppNotice>
            <MediaActivityLog :events="activity.events" />
          </section>
        </div>

        <MediaMenu v-model:open="menuOpen" :title="media.title" :actions="menuActions" />

        <ConfirmDialog
          v-model:open="confirming"
          title="Remove from the library?"
          :description="confirmText"
          confirm-label="Remove"
          :busy="removing"
          :error="removeError"
          @confirm="onRemove"
        />
      </article>
    </QueryState>
  </AppPage>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useResizeObserver, useTitle } from "@vueuse/core";
import type { LibraryMediaType, RequestState } from "#shared/types";
import { backdropUrl } from "#web/utils/images";
import { readPreview } from "#web/utils/title-preview";
import { formatDuration, formatSize } from "#web/utils/format";
import MediaActivityLog from "#web/components/MediaActivityLog.vue";
import MediaMenu from "#web/components/MediaMenu.vue";
import MediaStatus from "#web/components/MediaStatus.vue";
import SeasonList from "#web/components/SeasonList.vue";
import AppCard from "#web/components/ui/AppCard.vue";
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
import IconSearch from "~icons/ph/arrow-clockwise";
import IconTrash from "~icons/ph/trash";
import type { MenuAction } from "#web/components/menu";

/** A round button that stays legible over whatever the artwork is. */
const GLASS =
  "flex size-10 items-center justify-center rounded-full border border-white/10 bg-bg-base/60 text-text-primary backdrop-blur-md transition-colors hover:bg-bg-base/80";

const route = useRoute();
const router = useRouter();

const mediaType = computed(() => route.params.mediaType as LibraryMediaType);
const tmdbId = computed(() => Number(route.params.tmdbId));

const { data: media, error, isPending, refetch } = useMediaDetail(mediaType, tmdbId);
const { data: activity } = useMediaActivity(mediaType, tmdbId);
const { isAdmin } = useSession();

const preview = computed(() => readPreview(window.history.state, mediaType.value, tmdbId.value));
const heading = computed(() => media.value ?? preview.value);

useTitle(() => (heading.value ? `${heading.value.title} — Kyle` : "Kyle"));

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
const overviewText = ref<HTMLElement | null>(null);
const overviewClamped = ref(false);

function measureOverview() {
  const element = overviewText.value;
  overviewClamped.value = !!element && element.scrollHeight > element.clientHeight + 1;
}

useResizeObserver(overviewText, measureOverview);
watch(
  () => media.value?.overview,
  () => nextTick(measureOverview),
);

const menuOpen = ref(false);

const retry = useRetryRequest();

/** An admin, or whoever asked for it, decides what happens to it. */
const canManage = computed(
  () => !!media.value?.library && (isAdmin.value || media.value.requestedByMe),
);

/** Anything held can be looked for again; a service that is down cannot be asked. */
const menuActions = computed<MenuAction[]>(() => {
  const item = media.value;
  if (!item?.library) return [];

  const actions: MenuAction[] = [];
  if (item.status?.state !== "unknown") {
    actions.push({
      label: "Search again",
      icon: IconSearch,
      run: () => retry.mutateAsync({ mediaType: item.mediaType, tmdbId: item.tmdbId }),
    });
  }
  if (canManage.value) {
    const size = item.library.sizeOnDisk;
    actions.push({
      label: "Remove",
      hint: size > 0 ? `Frees ${formatSize(size)}` : undefined,
      icon: IconTrash,
      danger: true,
      run: () => {
        confirming.value = true;
      },
    });
  }
  return actions;
});

const hasMenu = computed(() => menuActions.value.length > 0);

const confirmText = computed(() => {
  const item = media.value;
  if (!item?.library) return "";
  const size =
    item.library.sizeOnDisk > 0 ? ` and delete ${formatSize(item.library.sizeOnDisk)}` : "";
  return `This removes “${item.title}” from the library${size}.`;
});

const removing = ref(false);
const confirming = ref(false);
const removeError = ref("");

watch(confirming, (open) => {
  if (open) removeError.value = "";
});

// Removing changes the library, so the mutation refreshes this page with it.
const remove = useRemoveLibraryItem();

async function onRemove() {
  const library = media.value?.library;
  if (!library) return;

  removeError.value = "";
  removing.value = true;
  try {
    await remove.mutateAsync({ mediaType: mediaType.value, serviceId: library.serviceId });
    confirming.value = false;
  } catch (e) {
    removeError.value = e instanceof Error ? e.message : "Could not remove this";
  } finally {
    removing.value = false;
  }
}

const SERIES_CARD_STATES = new Set<RequestState>(["removed", "unknown"]);

const showsStatus = computed(() => {
  const item = media.value;
  if (!item?.status || item.mediaType === "movie") return true;
  return SERIES_CARD_STATES.has(item.status.state);
});

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
