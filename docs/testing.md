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

### The database is part of the test environment

There is no "tests that need a database" any more. `bunfig.toml` preloads
`server/db/test-env.ts`, which points every run at **pglite** — Postgres compiled to
WASM, running in this process, migrated and empty. No Docker, nothing to start, and the
suite passes on a laptop with nothing installed.

It deliberately ignores `DATABASE_URL` from `.env`, so a test run can never delete rows
from the development database. To run against a real server instead:

```bash
TEST_DATABASE_URL=postgresql://kyle:kyle@localhost:5433/kyle bun run test
```

which is exactly what CI does, so every test is checked against both.

## Two gates

1. **Pre-commit** (`lefthook.yml`) runs all of the above, in parallel. This is what
   normally catches things.
2. **CI** (`.github/workflows/deploy.yml`) runs the same checks on a clean checkout,
   against **a real Postgres** rather than pglite, and **gates the deploy**. It exists
   because the hook can be skipped with `--no-verify`, and because the in-process
   database is close to Postgres but not identical to it.

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

- **Writes are checked by reading them back.** Assert on the row in the database, not on
  the arguments a mock was called with — the second cannot tell you the upsert worked.
- **Pure functions get tests, always.** `mountFor`, `resolveState`, `annotateRequesters`,
  `formatSize`. **Export them normally** — there is no `__testing` object.
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

### Do not hide exports behind `__testing`

It exports the function anyway; the name is the only guard, and nothing enforces it. Worse,
it makes a second API surface with no rules about what belongs in it — a constant ended up
in one — and it lets a module keep logic that has outgrown it.

That is not hypothetical. `annotateRequesters` in `library/service.ts` and `annotate` in
`dashboard/activity.ts` were the same function, character for character, each behind its own
`__testing` block, each with the same three tests. The second was written without anyone
noticing the first, because both looked tested. They are now one module,
`server/requests/requesters.ts`, with one plain export and one set of tests.

**If a function deserves a test, export it. If exporting it feels wrong, it wants its own
module** — which is the same conclusion, reached honestly.

### Database fixtures

`server/db/testing.ts` has `createTestUser` and `deleteTestUser`. Everything hangs off a
user, so deleting one is enough to clean up. Give rows a `beforeAll` user and an
`afterAll` delete; the in-process database starts empty on every run regardless.

## Current gaps

Honest list, so nobody assumes coverage that is not there:

- `server/dashboard/service.ts` — the per-source `tolerate` fallback is untested.
- pglite is single-connection, so nothing about locking or concurrent writes is covered.
  CI runs the same suite against a real Postgres, which at least catches dialect drift.
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
