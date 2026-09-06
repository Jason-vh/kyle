# Design system

Tailwind CSS 4, one token layer, and a small set of primitives in
`web/src/components/ui/`. The whole point is that a view describes _what_ something
is, and the system decides how it looks.

## The one rule

**Name the role, never the hue.** A component says `text-accent-red`, never
`text-red-600`; `bg-bg-surface`, never `bg-white`. Every colour a view can reach for is
already semantic, so re-pointing the tokens changes the whole app at once — which is
exactly how the dark scheme works, and why no component knows it exists.

If you find yourself wanting a colour that has no token, add the token.

## Tokens

Defined in `web/src/main.css` under `@theme`, so Tailwind generates utilities for them.

| Group    | Tokens                                                           | For                                               |
| -------- | ---------------------------------------------------------------- | ------------------------------------------------- |
| Surfaces | `bg-base`, `bg-surface`, `bg-elevated`, `bg-input`, `bg-overlay` | page, cards, fills, inputs                        |
| Lines    | `border-primary`, `border-secondary`                             | card edges, dividers                              |
| Text     | `text-primary`, `text-secondary`, `text-muted`, `text-inverse`   | body copy down to captions                        |
| Accents  | `accent-purple`, `-blue`, `-green`, `-red`, `-amber`, `-cyan`    | brand and status                                  |
| Tints    | each accent's `-light`                                           | a background behind text of the same accent       |
| Shape    | `rounded-card`, `rounded-control`                                | cards, and everything you press or type into      |
| Depth    | `shadow-card`, `shadow-raised`                                   | deliberately shallow; borders do most of the work |
| Layout   | `max-w-page`                                                     | the reading column every page shares              |

An accent and its `-light` are a **pair**: `text-accent-green` on `bg-accent-green-light`
is guaranteed to have contrast in both schemes. Do not mix pairs.

### Dark scheme

A `@media (prefers-color-scheme: dark)` block re-points the same variable names. It is
unlayered CSS, so it wins over Tailwind's theme layer without `!important`.

Two things to keep in mind when adding a token:

- Add its dark value at the same time, or it will silently stay light.
- `-light` tints go **dark** in dark mode, not pale. They exist to sit behind text,
  and a pale tint under light text is unreadable.

## Primitives

| Component        | Use it for                                                                |
| ---------------- | ------------------------------------------------------------------------- |
| `AppPage`        | the page container. Its bottom padding clears the phone tab bar           |
| `PageHeader`     | page title, optional subtitle, optional `#aside` slot for actions         |
| `SectionHeading` | a heading within a page, with an optional "see all" link                  |
| `AppCard`        | any bordered surface. `:padded="false"` when the content owns its padding |
| `AppButton`      | `variant`: primary, secondary, ghost, danger. `size`: sm, md              |
| `AppInput`       | text and search inputs                                                    |
| `FilterChips`    | a single-choice pill row. Scrolls sideways on a phone                     |
| `StatusPill`     | a small badge, by `tone`                                                  |
| `AppNotice`      | an inline message block, by `tone`                                        |
| `QueryState`     | the loading / failed / empty triple every list needs                      |
| `Skeleton`       | a pulsing block standing in for content that has not arrived              |
| `MediaPoster`    | poster art at `sm`, `md` or `lg`, with a fallback                         |
| `StatCard`       | a labelled figure, optionally with a proportion bar                       |
| `NavIcon`        | the tab bar glyphs                                                        |

`Tone` and `IconName` live in `web/src/components/ui/types.ts`, because `<script setup>`
cannot export a type itself.

### What Reka is doing under each

| Component                                         | Reka                       | What it buys                                                                                                   |
| ------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `FilterChips`                                     | `ToggleGroup`              | `role="group"`, `aria-pressed`, arrow-key movement, and one tab stop for the whole row instead of one per chip |
| `ConfirmDialog`                                   | `AlertDialog`              | focus trap, Escape to cancel, `aria-labelledby`/`describedby`, portal                                          |
| `MediaPoster`                                     | `AspectRatio`              | 2:3 from the ratio rather than a hardcoded height per width                                                    |
| `StatCard`                                        | `Progress`                 | `role="progressbar"` with real aria values on the fill bar                                                     |
| `AppInput`                                        | `Label` + `VisuallyHidden` | a real label, since a placeholder is not one                                                                   |
| `AppButton`, `AppCard`, `AppNotice`, `StatusPill` | `Primitive`                | `as` and `asChild`, so a card can be an `<li>` or wrap a link                                                  |

`AppPage`, `PageHeader`, `SectionHeading`, `NavIcon` and `QueryState` use no Reka: there
is no behaviour to borrow, and wrapping a `<div>` in `Primitive` to render a `<div>`
would be consistency for its own sake.

**`ConfirmDialog` does not use `AlertDialogAction`**, which closes the dialog the moment
it is clicked. The caller closes it when the work is actually finished, which is what
makes its `busy` state mean anything.

### QueryState

Views used to repeat the same three states by hand and drift apart. Now:

```vue
<QueryState :loading="loading" :error="error" :empty="items.length === 0">
  <template #empty>Nothing yet. <router-link to="/discover">Add something</router-link></template>
  <div class="flex flex-col gap-2">…</div>
</QueryState>
```

`error` is a string, and it is the real upstream message — see the error convention in
the root README. A household would rather read what actually broke.

### Loading

`QueryState` crossfades between its states, so **no view animates by hand** and every
list in the app appears the same way. `prefers-reduced-motion` turns the transition off.

Its `#loading` slot takes a skeleton; without one it falls back to "Loading…". A skeleton
is only worth it when it has **the shape of what arrives** — same poster ratio, same
number of lines — otherwise it is a spinner with extra steps. `MediaRowSkeleton` is that
shape for the four views that list media:

```vue
<QueryState :loading="isPending" :error="error">
  <template #loading><MediaRowSkeleton :count="6" /></template>
  …
</QueryState>
```

`isPending` is first-load only. A background refresh deliberately shows nothing: it
happens on every revisit, and a bar flickering each time is worse than silence.

## Adding a primitive

It earns its place when the same markup appears in **three** views, or when two views
must agree about meaning (a request's state, say, lives in `RequestRow` so the home
screen and the requests page can never word it differently).

Keep them presentational: props in, events out, no fetching.

## Mobile

Kyle is used on a phone. That constrains a few things:

- **Nav sits at the bottom under `sm`.** The top of a phone screen is out of reach.
  `App.vue` renders the same `NAV_LINKS` as a top row on desktop and a tab bar on
  phones; `AppPage` reserves the space it floats over.
- **Touch targets are 44px.** `AppButton` at `md` and `AppInput` are `min-h-11`. `sm`
  is only for controls that sit beside text and are never the only way to do something.
- **Inputs are 16px on phones.** Anything smaller makes iOS Safari zoom on focus.
  `AppInput` is `text-base sm:text-sm` for exactly this reason.
- **Rows stay one line.** `truncate` on titles, `min-w-0` on the flex child that holds
  them, `shrink-0` on anything beside it.
- Safe areas are respected through `env(safe-area-inset-bottom)`.

## Not yet converted

`LoginView`, `ThreadListView` and `ThreadDetailView` still hand-roll their markup. The
thread views are a debugging tool for the chatbot rather than a place people spend time,
so they are the last in the queue.
