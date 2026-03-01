import { createRouter, createWebHistory } from "vue-router";
import { checkAuth } from "./api/auth";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/login",
      name: "login",
      component: () => import("./views/LoginView.vue"),
    },
    {
      path: "/invite/:code",
      name: "invite",
      component: () => import("./views/InviteView.vue"),
    },
    {
      path: "/",
      redirect: "/threads",
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

  if (to.meta.requiresAuth) {
    const authenticated = await checkAuth();
    if (!authenticated) {
      return { name: "login" };
    }
  }
});
