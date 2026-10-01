<template>
  <!--
    A capsule narrower than the cards, so it reads as a control and not as
    another row. It stays clear of the bottom edge, and everything it draws
    stays inside it: iOS Safari tints the area under its toolbar after any
    fixed element that touches it, and dims the page for a shadow cast near it.
  -->
  <nav
    class="glass fixed inset-x-0 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-10 mx-auto flex w-[min(20rem,calc(100%-3rem))] rounded-full p-1 sm:hidden"
  >
    <div
      ref="lens"
      class="lens absolute inset-y-1 left-1 rounded-full"
      :class="{ 'opacity-0': activeIndex === -1 }"
      :style="{
        width: `calc((100% - 0.5rem) / ${NAV_LINKS.length})`,
        translate: `${lensIndex * 100}% 0`,
      }"
      aria-hidden="true"
    />

    <router-link
      v-for="(link, index) in NAV_LINKS"
      :key="link.to"
      :to="link.to"
      class="relative flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[11px] font-medium no-underline transition-colors"
      :class="index === activeIndex ? 'text-accent' : 'text-text-muted'"
    >
      <component
        :is="index === activeIndex ? link.activeIcon : link.icon"
        class="size-6"
        aria-hidden="true"
      />
      {{ link.label }}
    </router-link>
  </nav>
</template>

<script setup lang="ts">
import { computed, ref, useTemplateRef, watch } from "vue";
import { useRoute } from "vue-router";
import { isNavLinkActive, NAV_LINKS } from "#web/nav";

const route = useRoute();
const lens = useTemplateRef<HTMLElement>("lens");

const activeIndex = computed(() =>
  NAV_LINKS.findIndex((link) => isNavLinkActive(route.path, link.to)),
);

// Off every tab, the lens fades where it was, so coming back slides it from there.
const lensIndex = ref(Math.max(activeIndex.value, 0));

watch(activeIndex, (index, previous) => {
  if (index === -1) return;
  lensIndex.value = index;
  if (previous !== -1) stretch();
});

/** The lens stretches as it slides and settles round when it lands, like a drop. */
function stretch() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  lens.value?.animate([{ scale: "1 1" }, { scale: "1.22 0.86", offset: 0.35 }, { scale: "1 1" }], {
    duration: 520,
    easing: "cubic-bezier(0.3, 0, 0.2, 1)",
  });
}
</script>

<style scoped>
/*
 * Glass: a translucent fill over a blurred, saturated backdrop, a sheen
 * across its top half, and a rim catching light at opposite corners.
 * Safari will not resolve variables inside -webkit-backdrop-filter, so its
 * values are written out.
 */
.glass {
  background: var(--color-bg-float);
  box-shadow: var(--float-shadow);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  backdrop-filter: blur(20px) saturate(180%);
}

.glass::before,
.glass::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
}

.glass::before {
  background: linear-gradient(to bottom, var(--float-sheen), transparent 55%);
}

.glass::after {
  padding: 1px;
  background: linear-gradient(
    150deg,
    var(--float-sheen),
    transparent 35%,
    transparent 65%,
    var(--float-sheen)
  );
  mask:
    linear-gradient(#000 0 0) content-box exclude,
    linear-gradient(#000 0 0);
}

/* A neutral tint rather than the accent: the tab's own colour already says which. */
.lens {
  background: color-mix(in srgb, var(--color-text-primary) 7%, transparent);
  box-shadow:
    inset 0 1px 0 var(--float-sheen),
    inset 0 0 0 1px color-mix(in srgb, var(--color-text-primary) 5%, transparent);
  transition:
    translate 0.5s cubic-bezier(0.34, 1.3, 0.5, 1),
    opacity 0.2s ease-out;
}

@media (prefers-reduced-motion: reduce) {
  .lens {
    transition: opacity 0.2s ease-out;
  }
}
</style>
