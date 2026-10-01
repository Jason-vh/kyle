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
    <!-- Positioned, so the sheen drawn over the glass stays beneath it. -->
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
import { computed } from "vue";
import { useRoute } from "vue-router";
import { isNavLinkActive, NAV_LINKS } from "#web/nav";

const route = useRoute();

const activeIndex = computed(() =>
  NAV_LINKS.findIndex((link) => isNavLinkActive(route.path, link.to)),
);
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
</style>
