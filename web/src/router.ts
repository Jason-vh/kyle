import { createRouter, createWebHistory } from "vue-router";
import { useQueryCache } from "@pinia/colada";
import { pinia } from "./pinia";
import { sessionQuery } from "./queries/session";

export const router = createRouter({
  history: createWebHistory(),
  // A new page starts at the top; going back returns to where you left off.
  scrollBehavior: (_to, _from, savedPosition) => savedPosition ?? { top: 0 },
  routes: [
    {
      path: "/login",
      name: "login",
      component: () => import("./views/LoginView.vue"),
    },
    {
      path: "/",
      redirect: "/home",
    },
    {
      path: "/home",
      name: "home",
      component: () => import("./views/DashboardView.vue"),
      meta: { requiresAuth: true },
    },
    {
      path: "/discover",
      name: "discover",
      component: () => import("./views/DiscoverView.vue"),
      meta: { requiresAuth: true },
    },
    {
      path: "/library",
      name: "library",
      component: () => import("./views/LibraryView.vue"),
      meta: { requiresAuth: true },
    },
    {
      path: "/media/:mediaType(movie|series)/:tmdbId(\\d+)",
      name: "media",
      component: () => import("./views/MediaView.vue"),
      meta: { requiresAuth: true },
    },
    {
      path: "/requests",
      name: "requests",
      component: () => import("./views/RequestsView.vue"),
      meta: { requiresAuth: true },
    },
    {
      path: "/account",
      name: "account",
      component: () => import("./views/AccountView.vue"),
      meta: { requiresAuth: true },
    },
    {
      path: "/threads",
      name: "threads",
      component: () => import("./views/ThreadListView.vue"),
      meta: { requiresAuth: true },
    },
    {
      path: "/threads/:id",
      name: "thread",
      component: () => import("./views/ThreadDetailView.vue"),
      meta: { requiresAuth: true },
    },
  ],
});

router.beforeEach(async (to) => {
  // Allow shared links with ?sig= without auth (thread detail only)
  if (to.name === "thread" && to.query.sig) return;

  if (!to.meta.requiresAuth) return;

  // The same cache entry the views read, so navigating costs one request in
  // total rather than one per guard and one per page.
  const cache = useQueryCache(pinia);
  const { data } = await cache.refresh(cache.ensure(sessionQuery));

  if (!data?.authenticated) return { name: "login" };
});
