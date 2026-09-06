# Testing and tooling

## The one command

```bash
bun run check   # format, lint, both typecheckers, both test suites
```

Everything below is a piece of that. If `check` passes, the commit is good.

| Step        | Tool               | Scope                              |
| ----------- | ------------------ | ---------------------------------- |
| `fmt:check` | oxfmt              | everything                         |
| `lint`      | oxlint             | everything                         |
| `typecheck` | `tsc` + `vue-tsc`  | `server/` + `shared/`, then `web/` |
| `test`      | `bun test`         | `server/` + `shared/`              |
| `test:web`  | Vitest + happy-dom | `web/src/`                         |

`bun test` is scoped to `server shared` so it does not try to run the web suite,
which needs a DOM.

## Two gates

1. **Pre-commit** (`lefthook.yml`) runs all of the above, in parallel. This is what
   normally catches things.
2. **CI** (`.github/workflows/deploy.yml`) runs the same checks on a clean checkout,
   against a real Postgres, and **gates the deploy**. It exists because the hook can be
   skipped with `--no-verify` and because ~7 database-backed tests skip themselves when
   `DATABASE_URL` is unreachable — locally that is most of the time, in CI it is never.

A failed check means nothing is deployed and the running app is untouched. GitHub emails
the pusher when a run fails.

## What gets a test

**Anything that can be wrong without anything failing.** That is the bar, and it is not
"anything with logic in it".

The two bugs this codebase has actually shipped were both of that shape:

- `mountFor` matched `/` against nothing, so the storage figure came from the wrong
  disk. It looked like a number.
- `addedAt%3E%3D=` made Plex ignore the filter and count the entire library. It also
  looked like a number — 2537 new episodes in a week.

Both now have tests, and both tests fail if you reintroduce the bug. That is the point:
a test on a wrong-but-plausible output is worth ten on a crash.

In practice:

- **Pure functions get tests, always.** `mountFor`, `resolveState`, `annotate`,
  `formatSize`. Export them through an `__testing` object if they are not part of the
  module's public surface.
- **Anything that talks to a service gets fetch stubbed**, and the test asserts the
  _request_ as well as the response handling — see the `>=` regression tests in
  `server/plex/`.
- **Components get tests when two places must agree.** `RequestRow` decides the wording
  for a request's state; the home screen and the requests page both render it, so the
  wording is pinned in `RequestRow.test.ts` rather than in either view.
- **Views do not get tests.** They wire things together, and a test of that is a test of
  Vue.

## Patterns

### Stubbing a service

```ts
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

globalThis.fetch = ((url: string) => {
  if (url.includes("/movie?tmdbId=")) return Promise.resolve(Response.json([]));
  return Promise.resolve(new Response("unexpected", { status: 500 }));
}) as unknown as typeof fetch;
```

Return a 500 for anything unexpected: a test that quietly succeeds on the wrong call is
worse than one that fails.

### Replacing a module

`mock.module` replaces it for the whole run, so spread the real one and override only
what the test needs:

```ts
const real = await import("../db/requests.ts");
mock.module("../db/requests.ts", () => ({ ...real, saveMediaRequest: … }));
```

Import the module under test _after_ the mock, with a top-level `await import`.

### Tests that need Postgres

They must skip themselves when `DATABASE_URL` is unreachable, so `bun run check` passes
without Docker. `server/agent/conversation.test.ts` is the example. To run them:

```bash
bun run db:up && bun run db:migrate && bun test
```

CI always runs them.

## Current gaps

Honest list, so nobody assumes coverage that is not there:

- `server/dashboard/service.ts` — the per-source `tolerate` fallback is untested.
- `server/agent/` — `run.ts`'s overload retry is not covered.
- `server/slack/`, `server/discord/` — only the stream buffering is covered.
- `web/` — the views have no tests, by choice; the primitives are covered where they
  carry behaviour or wording, not where they are markup.
- No browser-level end-to-end test.

## Linting

oxlint runs with its defaults (93 rules) and no config file. The aggressive rule sets
were tried and rejected: they flag 30 things, almost all of them noise —
`no-await-in-loop` on a deliberate polling loop, and a `postMessage` rule that fires on
Slack's `chat.postMessage`. Add a `.oxlintrc.json` when there is a rule worth the
config, not before.
