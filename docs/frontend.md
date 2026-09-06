# Frontend

Vue 3 + Vite + Tailwind CSS 4, served by the Bun server out of `web/dist` in production
and by Vite on `:5173` in development, proxying `/api` to `:3000`.

```text
web/src/
  main.ts            → app bootstrap
  main.css           → design tokens + dark scheme (see design-system.md)
  router.ts          → routes and the auth guard
  nav.ts             → NAV_LINKS, shared by the header and the tab bar
  App.vue            → header, tab bar, <RouterView>
  api/               → one module per resource; the only place fetch is called
  views/             → one per route
  components/        → app components (RequestRow, ActivityRow, MediaCard, …)
  components/ui/     → the design system primitives
  composables/       → useRelativeTime
  utils/             → format (names, sizes, durations), markdown
```

## Routes

| Path                       | View            | Notes                                     |
| -------------------------- | --------------- | ----------------------------------------- |
| `/`                        | —               | redirects to `/home`                      |
| `/home`                    | `DashboardView` | the default landing page                  |
| `/discover`                | `DiscoverView`  | search TMDB and request                   |
| `/library`                 | `LibraryView`   | what the services hold; admins can remove |
| `/requests`                | `RequestsView`  | your requests, or everyone's for an admin |
| `/account`                 | `AccountView`   | Plex link, passkeys, sign out             |
| `/threads`, `/threads/:id` | thread viewer   | debugging the chatbot; not in the nav     |
| `/login`                   | `LoginView`     | Plex and passkey sign-in                  |

`router.beforeEach` checks `meta.requiresAuth` against `/api/auth/status`, except for a
thread opened with a `?sig=` share link.

**A new route needs adding to `SPA_PATHS` in `server/server.ts`**, or a hard refresh on
it returns 404 instead of the app.

## The API layer

`web/src/api/client.ts` owns `apiFetch`: credentials, JSON, and turning a failed
response into an `Error` carrying the server's own message. Nothing else calls `fetch`.

Each module re-exports the types it needs from `@shared/types`, which is the same file
the server responds with — so a shape change is a type error on both sides rather than a
runtime surprise. When adding a response type, put it in `shared/types.ts`, not in the
API module.

Views own their loading and error state and hand it to `QueryState`. There is no store;
each view fetches what it needs on mount. For a household-sized app this is less
machinery than it would cost to avoid, and every page is a single request.

## Conventions

- **Formatting helpers live in `utils/format.ts`** — `formatNames`, `formatSize`,
  `formatDuration`. They were duplicated across views before.
- **`useTitle` on every view**, so the tab says where you are.
- **A slower reply must not overwrite a faster one.** `DiscoverView` numbers its
  searches and drops stale results; do the same anywhere input drives a fetch.
- **Type-check with `vue-tsc`** — `bun run check` at the repo root runs it, and so does
  the pre-commit hook.

## Development

```bash
bun run dev      # backend on :3000
bun run dev:web  # Vite on :5173, proxying /api
```
