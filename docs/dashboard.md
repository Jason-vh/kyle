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

The seedbox quota answers for this, via Ultra's `/total-stats`. Radarr and Sonarr see the
array the slot sits on, not the slot's share of it — they report ~16 TB where the quota is
~8 TB, so their figure is wrong by double and always will be.

Ultra allows **10 requests an hour**, which a phone would spend in a minute, so
`server/ultra/api.ts` caches the answer for ten minutes. The quota moves slowly.

**There is no fallback.** Asking the services instead would answer with a number that is
confidently wrong, and a figure nobody can tell is wrong is worse than a missing one. When
Ultra cannot be reached the card is empty and the page names it in `unavailable`.

`requestedBytes` is what the titles in `media_requests` take up, summed from Radarr's
`sizeOnDisk` and Sonarr's `statistics.sizeOnDisk` — how much of the disk is things people
asked Kyle for, as against the library that predates it. It fails the same way, under
"Radarr and Sonarr", so an outage cannot read as "nobody asked for anything".

A blank card only helps someone already looking at it, so `server/ultra/health.ts` watches
the same figure for the scheduler: `checkSeedbox()` DMs the admins on Slack when the box
stops answering, when under 5% of the quota is left, and once more when it recovers. It
speaks on a change of condition and then at most twice a day, so a disk that stays full
does not fill Slack as well. The Ultra service on the seedbox was dead for months before
anyone noticed; this is what notices.

## Recently downloaded — `server/dashboard/activity.ts`

Radarr's and Sonarr's own history, filtered to `downloadFolderImported` — history is
noisy with grabs, failures and renames, and only an import means it landed. Plex is not
used here because only the services know the title behind a file.

Episodes are gathered under the series they belong to, so a season arriving at once is one
row (`Season 1 · 10 episodes`) rather than ten. The row is dated by the newest episode in
it, and an episode imported twice — Sonarr writes a second row when one is upgraded — is
counted once.

Each item is matched to `media_requests` by TMDB id, so the feed says who asked for it.
Anything added by hand simply has nobody, which is expected for a library that predates
Kyle.

## Your requests — `server/requests/state.ts`

State is **derived, not stored**, so it can never drift from what the services are doing.
Each one says what the requester should expect next, not where the file is:

| State         | Meaning                                                              |
| ------------- | -------------------------------------------------------------------- |
| `blocked`     | downloaded, and the import failed or is held — needs somebody        |
| `stalled`     | downloading with a warning: no seeders, no connections               |
| `downloading` | actually moving, with progress and an ETA                            |
| `found`       | a release is in hand, held back by a delay profile                   |
| `importing`   | downloaded; Plex has yet to show it, so it cannot be watched yet     |
| `ready`       | on disk and watchable on Plex, with a link there                     |
| `paused`      | nothing on disk and nobody monitoring it — nothing will ever happen  |
| `unreleased`  | not out anywhere yet; `expectedAt` says when                         |
| `waiting`     | out, but not in a form we can fetch — in cinemas, digital date ahead |
| `searching`   | obtainable, monitored, nothing to show for it yet                    |
| `removed`     | not in the library; `detail` says who took it out, when Kyle saw it  |

The queue (`server/requests/queue.ts`) speaks first, since it is the only thing moving —
except for a title already complete on disk, whose queue can only be an upgrade nobody is
waiting on. Where several records belong to one title, the one needing a hand wins, and
among equals the furthest along.

A state carries `detail` (what the service said: a stall, a rejection, a bad file),
`expectedAt`, and `since`. `RequestRow.vue` is the one place they are put into words.

`ready` is checked against Plex (`server/plex/catalog.ts`): a title on disk that Plex has
yet to show reads `importing` until Plex scans it — or for six hours, after which its
absence is read as a match Plex never made rather than a scan still pending. Plex being
unable to answer holds nothing back; it can confirm a title, never deny one.

The home page shows only what is still coming — `stillComing` in
`server/dashboard/service.ts` drops `removed`, which is over and not on its way. The
requests page keeps it, where knowing a title left and who took it is the point.

Radarr and Sonarr forget a title the moment it is removed, so `media_removals`
(`server/db/removals.ts`) records who took it out and when, written by the one removal path
in `server/library/service.ts` and by the agent's remove tools. Requesting the title again
forgets the row, since how it once left stops being the answer.

A series is read season by season, from the statistics Sonarr already returns with the
listing: monitored seasons only, specials excluded. So 28 of 30 episodes is still `ready`
— it is watchable — but it says `Season 4 · 2 episodes missing` rather than letting the
whole-series count hide the gap.

Progress is `1 - sizeleft / size`. For a series, the furthest-along episode is shown,
since it is the next thing that will become watchable.

The same function backs `GET /api/requests`, so the home screen and the requests page
cannot disagree.

### Acting on a state

One action per state, in `RequestActions.vue`:

| State       | Action        | What it does                                          |
| ----------- | ------------- | ----------------------------------------------------- |
| `searching` | Search again  | `POST /api/requests/:type/:id/retry`                  |
| `stalled`   | Try another   | the same, after dropping and blocklisting the release |
| `blocked`   | Tell an admin | `POST /api/requests/:type/:id/report`                 |
| `removed`   | Request again | the ordinary request path                             |

A stalled release is blocklisted before the search (`server/requests/retry.ts`), so the
search that follows cannot hand back the release that stuck. A blocked import is left
alone: it has the file already and needs a person, not another release — hence the report,
which reads the state on the server and notifies every admin with whatever the service
said. Every other state is waiting on a date or on a download, and offers nothing to press.

## Adding a figure

1. Write the source module beside its service (`server/plex/`, `server/dashboard/`),
   returning `undefined` rather than throwing when it cannot answer.
2. Add the field to `DashboardStats` in `shared/types.ts`.
3. Wire it into `getDashboard` inside the existing `Promise.all`.
4. Render it with `StatCard`. Pass `fraction` only where the figure is genuinely a
   proportion — the bar means "how full", not "how big".

Keep the pure part testable: `mountFor` and `resolveState` have tests precisely because
they are the parts that can be wrong without anything failing.
