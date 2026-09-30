import { createRouter, createWebHistory } from "vue-router";
import { useQueryCache } from "@pinia/colada";
import { pinia } from "./pinia";
import { sessionQuery } from "./queries/session";
import AccountView from "./views/AccountView.vue";
import DashboardView from "./views/DashboardView.vue";
import DiscoverView from "./views/DiscoverView.vue";
import LibraryView from "./views/LibraryView.vue";
import LoginView from "./views/LoginView.vue";
import MediaView from "./views/MediaView.vue";
import MembersView from "./views/MembersView.vue";
import PeopleView from "./views/PeopleView.vue";
import PersonView from "./views/PersonView.vue";
import RequestsView from "./views/RequestsView.vue";
import ThreadDetailView from "./views/ThreadDetailView.vue";
import ThreadListView from "./views/ThreadListView.vue";

export const router = createRouter({
  history: createWebHistory(),
  // A new page starts at the top; going back returns to where you left off.
  scrollBehavior: (to, from, savedPosition) => {
    if (savedPosition) return savedPosition;
    if (to.path === from.path) return false;
    return { top: 0 };
  },
  routes: [
    {
      path: "/login",
      name: "login",
      component: LoginView,
      meta: { hideNav: true },
    },
    {
      path: "/",
      redirect: "/home",
    },
    {
      path: "/home",
      name: "home",
      component: DashboardView,
      meta: { requiresAuth: true },
    },
    {
      path: "/discover",
      name: "discover",
      component: DiscoverView,
      meta: { requiresAuth: true },
    },
    {
      path: "/library",
      name: "library",
      component: LibraryView,
      meta: { requiresAuth: true },
    },
    {
      path: "/media/:mediaType(movie|series)/:tmdbId(\\d+)",
      name: "media",
      component: MediaView,
      meta: { requiresAuth: true },
    },
    {
      path: "/requests",
      name: "requests",
      component: RequestsView,
      meta: { requiresAuth: true },
    },
    {
      path: "/account",
      name: "account",
      component: AccountView,
      meta: { requiresAuth: true },
    },
    {
      path: "/members",
      name: "members",
      component: MembersView,
      meta: { requiresAuth: true },
    },
    {
      path: "/people",
      name: "people",
      component: PeopleView,
      meta: { requiresAuth: true, requiresAdmin: true },
    },
    {
      path: "/people/:id",
      name: "person",
      component: PersonView,
      meta: { requiresAuth: true, requiresAdmin: true },
    },
    {
      path: "/threads",
      name: "threads",
      component: ThreadListView,
      meta: { requiresAuth: true, requiresAdmin: true },
    },
    {
      path: "/threads/:id",
      name: "thread",
      component: ThreadDetailView,
      meta: { requiresAuth: true, requiresAdmin: true },
    },
  ],
});

router.beforeEach(async (to) => {
  if (!to.meta.requiresAuth) return;

  // The same cache entry the views read, so navigating costs one request in
  // total rather than one per guard and one per page.
  const cache = useQueryCache(pinia);
  const { data } = await cache.refresh(cache.ensure(sessionQuery));

  if (!data?.authenticated) return { name: "login" };

  if (to.meta.requiresAdmin && !data.user?.admin) return { name: "home" };
});
