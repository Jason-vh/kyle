# Dashboard

`GET /api/dashboard` builds the home screen from four independent sources. Each is
allowed to fail on its own: a page missing one figure beats a page that will not load.
`server/dashboard/service.ts` assembles them and names anything unreachable in
`unavailable`, which the view shows as a banner.

The window is **seven days**, defined once in `service.ts` so every figure on the page
agrees with the others.

## Watched — `server/plex/watch-time.ts`

1. `GET /status/sessions/history/all?viewedAt>=<epoch>` — the rows Plex recorded.
2. `GET /library/metadata/<id>,<id>,…` in batches of 80 — the runtime of each.
3. Sum.

**Plex history rows carry no duration and no watched offset**, so the item's own runtime
stands in. That makes this an approximation, and an honest one: Plex writes a history row
once something passes its watched threshold, so a row genuinely means "watched". Something
abandoned early contributes nothing, and something watched twice counts twice.

An item deleted since cannot say how long it was, so it is left out rather than guessed
at. The log line reports `plays` against `resolved`; a large gap means the library is
being cleaned up aggressively.

## Arrived — `server/plex/additions.ts`

Per library section, `GET /library/sections/<key>/all?type=<n>&addedAt>=<epoch>&X-Plex-Container-Size=0`.
Asking for none of the results still reports how many there are, so a count costs one
tiny response per section rather than the whole listing.

Movies are `type=1` and episodes are `type=4`. Episodes rather than series, because a
season landing is the thing people notice.

> **Plex matches a filter name literally.** `addedAt%3E%3D=` does _not_ work: Plex sees
> a parameter it does not recognise, ignores it, and returns the whole section. The
> failure mode is a plausible-looking number, not an error. Both call sites use raw `>=`
> in the template string — Bun's `fetch` passes it through unencoded. Do not "fix" it.

## Space left — `server/dashboard/storage.ts`

Radarr's `/rootfolder` gives the media path and its free space but no total; `/diskspace`
gives totals per mount. The mount is the **longest** one the root folder path starts
with, so `/home/x/media/Movies` resolves to `/home/x` rather than `/`. `/home/xy` must
not match `/home/x`, hence the separator in `mountFor`.

Free space comes from the root folder (fresher), the total from the mount (the only
place it exists). Sonarr answers if Radarr cannot; they are almost always the same disk.

## Just landed — `server/dashboard/activity.ts`

Radarr's and Sonarr's own history, filtered to `downloadFolderImported` — history is
noisy with grabs, failures and renames, and only an import means it landed. Plex is not
used here because only the services know the title behind a file.

Each item is matched to `media_requests` by TMDB id, so the feed says who asked for it.
Anything added by hand simply has nobody, which is expected for a library that predates
Kyle.

## Your requests — `server/requests/state.ts`

State is **derived, not stored**, so it can never drift from what the services are doing:

| State         | Meaning                                                                     |
| ------------- | --------------------------------------------------------------------------- |
| `downloading` | in a Radarr or Sonarr queue. Beats everything, even a series partly on disk |
| `available`   | the library holds it with files                                             |
| `pending`     | the library holds it with nothing on disk yet                               |
| `unavailable` | not in the library — it was removed after being asked for                   |

Progress is `1 - sizeleft / size`. For a series, the furthest-along episode is shown,
since it is the next thing that will become watchable.

The same function backs `GET /api/requests`, so the home screen and the requests page
cannot disagree.

## Adding a figure

1. Write the source module beside its service (`server/plex/`, `server/dashboard/`),
   returning `undefined` rather than throwing when it cannot answer.
2. Add the field to `DashboardStats` in `shared/types.ts`.
3. Wire it into `getDashboard` inside the existing `Promise.all`.
4. Render it with `StatCard`. Pass `fraction` only where the figure is genuinely a
   proportion — the bar means "how full", not "how big".

Keep the pure part testable: `mountFor` and `resolveState` have tests precisely because
they are the parts that can be wrong without anything failing.
