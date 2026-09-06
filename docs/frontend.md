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

| Path                        | View            | Notes                                           |
| --------------------------- | --------------- | ----------------------------------------------- |
| `/`                         | —               | redirects to `/home`                            |
| `/home`                     | `DashboardView` | the default landing page                        |
| `/discover`                 | `DiscoverView`  | search TMDB and request                         |
| `/library`                  | `LibraryView`   | what the services hold; admins can remove       |
| `/media/:mediaType/:tmdbId` | `MediaView`     | one title in full, reached from any of its rows |
| `/requests`                 | `RequestsView`  | your requests, or everyone's for an admin       |
| `/account`                  | `AccountView`   | Plex link, passkeys, sign out                   |
| `/threads`, `/threads/:id`  | thread viewer   | debugging the chatbot; not in the nav           |
| `/login`                    | `LoginView`     | Plex and passkey sign-in                        |

`router.beforeEach` checks `meta.requiresAuth` against `/api/auth/status`, except for a
thread opened with a `?sig=` share link.

**A new route needs adding to `SPA_PATHS` in `server/server.ts`** — or to `SPA_PREFIXES`
when it carries an id — or a hard refresh on it returns 404 instead of the app.

## Fetching data

Two layers, and views touch only the second.

`web/src/api/` owns the requests. `client.ts` provides `apiFetch`: credentials, JSON, and
turning a failed response into an `Error` carrying the server's own message. Nothing else
calls `fetch`.

`web/src/queries/` wraps those in [Pinia Colada](https://pinia-colada.esm.dev) queries and
mutations. **A view never calls an `api/` function directly** — it calls a composable:

```ts
const { data, error, isPending } = useLibrary();
const { isAdmin } = useSession();
```

Why it earns its place:

- **One request per answer.** The header, the router guard and three views all want the
  session; they get one `/api/auth/status` call between them.
- **Going back is instant.** The library listing is a multi-service call; `staleTime`
  means returning to it renders from cache and refreshes behind you.
- **A change invalidates what shows it.** `useRequestMedia()` invalidates library,
  requests, dashboard and discover, so requesting something updates every page that
  displays it. Before this, it updated none of them.
- **Races become impossible.** `discoverQuery` is keyed by the search term, so a slow
  reply for an earlier term is a different cache entry rather than something to guard
  against.

Pinia is only there because Colada needs it. **There are no stores** — if you find
yourself writing one, check the state is not really server state with a query missing.

Adding a query: put the options in `web/src/queries/`, export a `useX()` composable, and
if it changes media, add its key to `MEDIA_KEYS` in `queries/media.ts`.

Each module re-exports the types it needs from `@shared/types`, which is the same file
the server responds with — so a shape change is a type error on both sides rather than a
runtime surprise. When adding a response type, put it in `shared/types.ts`, not in the
API module.

Views hand a query's `isPending` and `error` straight to `QueryState`. `isPending` is
first-load only, so a background refresh keeps showing the data it already has.

## Conventions

- **Imports use `#web/` and `#shared/`**, never `../..`. Siblings stay relative.
- **Formatting helpers live in `utils/format.ts`** — `formatNames`, `formatSize`,
  `formatDuration`. They were duplicated across views before.
- **`useTitle` on every view**, so the tab says where you are.
- **No `watch` for fetching.** Key the query on what it depends on and let Colada do it.
  There are no `watch` calls left in the app.
- **Type-check with `vue-tsc`** — `bun run check` at the repo root runs it, and so does
  the pre-commit hook.

## Development

```bash
bun run dev      # backend on :3000
bun run dev:web  # Vite on :5173, proxying /api
```
