# Kyle

AI-powered Plex media library assistant. A natural-language interface for managing
Radarr, Sonarr, TMDB, qBittorrent, an Ultra seedbox, and Brave web search — reachable
from Slack, Discord, a web SPA, a CLI, or plain HTTP.

Built with [pi-agent-core](https://github.com/badlogic/pi-mono) + Anthropic Claude,
persisted in Postgres via Drizzle ORM, running on Bun. Live at <https://kyle.vhtm.eu>.

## Table of contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Key patterns](#key-patterns)
- [Development](#development)
- [Testing Slack locally](#testing-slack-locally)
- [Schema changes](#schema-changes)
- [User management](#user-management)
- [Slack app configuration](#slack-app-configuration)
- [Environment variables](#environment-variables)
- [API reference](#api-reference)
- [Web thread viewer](#web-thread-viewer)
- [Deployment](#deployment)
- [Conventions](#conventions)
- [Task tracking](#task-tracking)

## Overview

Kyle is a stateless, interface-agnostic agent. A new agent is created per request and
previous messages are replayed from the database, so every frontend — Slack, Discord, the
web app, the CLI, or raw HTTP — shares one backend and one conversation model.

Capabilities:

- **Media management** — add/remove movies (Radarr) and series/seasons/episodes (Sonarr),
  search TMDB, inspect queues/history/calendars, trigger downloads, manual imports.
- **Downloads** — qBittorrent torrent listing/removal, Ultra seedbox stats.
- **Notifications** — Sonarr/Radarr webhooks resolve who requested a title (via
  subscription tables) and notify them, with AI-generated summaries.
- **Conversation memory** — full agent messages stored as JSONB; browse past threads in the
  web viewer, shareable via signed `?sig=` links.
- **Auth** — Plex sign-in for anyone with access to the Plex server, plus WebAuthn passkeys
  and JWT sessions.
- **Requests & library** — search TMDB and add straight to Radarr/Sonarr without the agent;
  browse what the library holds. Anyone signed in can request and browse; only admins remove.

## Architecture

```text
index.ts                     → entry point (Bun.serve)
scripts/cli.ts               → interactive CLI client
scripts/plex-token.ts        → CLI: obtain a Plex owner token by claiming a PIN
scripts/test-slack.ts        → Send test messages to /slack/events (sync response by default)
tsconfig.server.json         → Server TypeScript config (server/ + shared/)
Dockerfile                   → Multi-stage build: web SPA + Bun runtime
docker-compose.yml           → Single app service, joins shared apps-net
docker-compose.dev.yml       → Local Postgres only
.github/workflows/deploy.yml → Self-hosted runner deploy
deploy/                      → Caddy snippet + production env shape

shared/
  types.ts                   → API response types shared between server + web
  media.ts                   → Episode/title formatting used by both server and viewer

server/
  server.ts                  → Route table (/api/*, /slack, /webhooks) + SPA serving
  config.ts                  → requireEnv()/optionalEnv(): env lookup at call time
  logger.ts                  → Structured JSON logger
  errors.ts                  → errorMessage()/errorFields(): log fields for a thrown value
  json.ts                    → safeJsonParse(): parse without throwing
  images.ts                  → downloadImages(): platform-agnostic image fetching
  media-links.ts             → Deep links into Radarr/Sonarr
  http/
    client.ts                → createApiClient(): shared JSON HTTP client for every service
  auth/
    jwt.ts                   → JWT sign/verify (jose), httpOnly cookie, sliding refresh
    middleware.ts            → requireAuth, requireAdmin, optionalAuth
    webauthn.ts              → WebAuthn registration/authentication (simplewebauthn)
  agent/
    index.ts                 → Public surface of the agent package
    tool.ts                  → Tool type: an AgentTool plus how to describe it
    registry.ts              → The one map from tool name to tool
    model.ts                 → Model selection (ANTHROPIC_MODEL)
    run.ts                   → Agent factory + runAgent(), overload retries
    conversation.ts          → runConversationTurn(): the turn pipeline every interface uses
    turn-writer.ts           → Persists messages + media events as the agent produces them
    tool-result.ts           → jsonResult(): the shape every tool returns
    table.ts                 → buildTable(): capped tables for tools that declare one
    tool-display.ts          → isActionTool() + describeToolCall(): how a call is shown
    result-tables.ts         → extractTable(): a tool result rendered as tabular data
    replies.ts               → What a user sees when a turn is empty or fails
    system-prompt.ts         → Kyle's system prompt + AgentContext
    requests-tool.ts         → get_requests_for_user tool
    unsubscribe-tool.ts      → unsubscribe_notifications tool
  db/
    index.ts                 → Drizzle + postgres connection
    schema.ts                → All tables
    users.ts                 → Platform identity resolution (cached), backfill, user CRUD
    threads.ts               → Queries behind the thread viewer
    media-events.ts          → Media event extraction + persistence
    subscriptions.ts         → Movie/series subscription CRUD, processMediaEvent
    migrate.ts               → Migration runner
  routes/
    chat.ts                  → POST /chat
    health.ts                → GET /health (includes deployId)
    slack-events.ts          → POST /slack/events: verify, dedup, dispatch
    threads-auth.ts          → HMAC-SHA256 thread sharing signatures (?sig= URLs)
    api/
      threads.ts             → GET /api/threads, GET /api/threads/:uuid
      auth.ts                → GET /api/auth/status, POST /api/auth/logout
      auth-passkey.ts        → Passkey login/register endpoints
      auth-plex.ts           → Plex sign-in, account linking, callback
      users.ts               → User listing, platform link management (admin)
  threads/
    items.ts                 → buildThreadItems(): messages + webhooks as viewer items
    usernames.ts             → Batch display-name resolution across app + platform users
  slack/                     → handler (one message → one turn), streaming, tables, verify
  discord/                   → discord.js client, messageCreate handler, user resolution
  sonarr/                    → types, api, utils, tools (12 tools)
  radarr/                    → types, api, utils, tools (7 tools)
  tmdb/                      → types, api, utils, tools (5 tools)
  ultra/                     → api, tools (stats)
  qbittorrent/               → api, tools (torrents)
  brave/                     → types, api, utils, tools (web search)
  plex/                      → plex.tv client, owner token calls, share list, access policy
  webhooks/
    types.ts                 → Webhook payload types + MediaNotificationInfo
    auth.ts                  → Basic-auth check (WEBHOOK_AUTH)
    requester.ts             → Find who requested media
    batch.ts                 → Collect a season's episodes before notifying once
    notify.ts                → Run the turn and post the reply to the right platform
    handler.ts               → POST /webhooks/sonarr + /webhooks/radarr

web/                         → Vue 3 + Vite + Tailwind CSS 4 SPA
  src/
    views/                   → ThreadList, ThreadDetail, Login, Account
    components/              → MessageBlock, ToolCallBlock, WebhookBlock, MarkdownContent, ...
    api/                     → client, threads, auth, passkey, plex
    composables/             → useRelativeTime
    utils/                   → markdown
```

## Key patterns

- **Stateless agent** — created per request; previous messages loaded from DB and restored
  via `agent.replaceMessages()`.
- **One turn pipeline** — Slack, Discord, and HTTP all call `runConversationTurn()`, which
  resolves the conversation, replays history, persists messages, and records media events.
  Each interface only supplies its own I/O (streaming, replies, thread status).
- **Incremental persistence** — messages are written on each `message_end` event rather than
  in one batch at the end, so the thread viewer shows a turn in progress and a turn that
  fails part-way still keeps what happened. Agent events are synchronous, so `turn-writer.ts`
  chains its writes: `messages.sequence` is an identity column, and concurrent inserts would
  order the thread by whichever insert landed first. A media event is queued behind the
  message whose tool call produced it, since it needs that row's id. Note the viewer fetches
  once on mount — following a live turn means refreshing.
- **JSONB messages** — full `AgentMessage` objects stored as JSONB in the `messages` table.
  The `role` and `sequence` columns exist only for querying and ordering.
- **Interface-agnostic conversations** — the `conversations` table has an `interfaceType`
  (http/slack/discord/cli). Slack is keyed by `externalId = "{channel}:{thread_ts}"`; Discord
  uses `"dm:{channelId}"` or `"thread:{threadId}"`.
- **User identity** — first-class `users` table with UUIDs, linked to platform identities
  (Slack/Discord) via `platform_identities`. Each row carries both a `platformUserId` (raw
  Slack/Discord ID) and a `userId` (uuid FK). The agent only ever sees app user UUIDs and
  display names — never platform-specific IDs.
- **Media events + subscriptions** — `media_events` is an append-only log of tool actions.
  `movie_subscriptions` / `series_subscriptions` track notification preferences (created on
  add/download, deactivated on remove/unsubscribe). Webhooks query subscriptions — not
  events — to decide who to notify.
- **Auth: Plex + passkeys + JWT** — access to the Plex server onboards a user on first
  sign-in; passkeys are added afterwards from `/account`. JWT sessions (`jose`, HS256) in an
  httpOnly `kyle_auth` cookie (30-day expiry, sliding refresh at 15 days). Thread sharing uses
  separate `?sig=` HMAC signatures (`THREAD_VIEWER_TOKEN`).
- **Slack immediate ack** — `/slack/events` returns 200 and processes the message async to
  stay within Slack's 3-second timeout. Responses always post as thread replies.
- **Slack streaming** — replies stream via `chat.startStream`/`appendStream`/`stopStream`.
  Text deltas are buffered and flushed through a serialized promise chain (agent event
  handlers are synchronous, so unserialized calls would race). Action tools surface as
  `task_update` cards; lookups only move the ephemeral thread status. Queue/calendar
  results append as Block Kit tables. Delivery is tracked exactly so text is never dropped
  or duplicated. Slack messages use **standard Markdown** (`markdown_text`), not mrkdwn.
- **Slack dedup** — in-memory `Set<string>` on `event_id` (capped at 10k) plus
  `X-Slack-Retry-Num` header skipping.
- **One HTTP client** — every outbound service (Sonarr, Radarr, TMDB, Ultra, Brave,
  qBittorrent) is a thin wrapper over `createApiClient()` in `server/http/client.ts`, which
  owns timeouts, error parsing (`ApiError`), JSON decoding, and optional session re-auth.
  Service modules only declare a base URL and headers, resolved per request via
  `requireEnv()` so missing configuration fails at call time with every missing name listed.
- **Declarative routing** — `server/server.ts` is a `Bun.serve({ routes })` table with
  `:params`; `maxRequestBodySize` enforces the 1 MB limit and `error()` turns any uncaught
  throw into a 500, so handlers contain no boilerplate. Unrouted GET/HEAD falls through to
  the SPA.
- **Structured logging** — `createLogger(module)` emits JSON lines. Use it everywhere; no
  raw `console.log`.
- **Token optimization** — each service has `utils.ts` with `toPartial*` helpers that strip
  API responses to essential fields before sending to the LLM.
- **Tools describe themselves** — a tool carries its own presentation: `label` (present
  tense, for the in-progress Slack status), `action` (marks a state change worth a task
  card), `summary` (past tense, for a finished call), and an optional `table`.
  `server/agent/registry.ts` is the only place a tool name maps back to a tool, so
  `tool-display.ts` and `result-tables.ts` are lookups over it.
- **Summaries name the media** — `summary` receives `(args, payload?)`, where the payload is
  the tool's own JSON result. Most actions take an ID (`remove_movie` gets a `movieId`), so
  the title only exists in the result — hence "Removed Inception (2010) from Radarr" rather
  than "Removed movie from Radarr". The payload is absent for a call that never finished, so
  every summary keeps a generic fallback. The Slack task card and the thread viewer both use
  it, so they can never drift.
- **Adding a new tool** — create `api.ts` (over `createApiClient`) + `tools.ts` under
  `server/<service>/`, returning `jsonResult(...)` from `server/agent/tool-result.ts`. Add
  the tool to that module's exported list and the list to `server/agent/registry.ts`, then
  add the service to the media list in `server/agent/system-prompt.ts` — the agent won't use
  tools it doesn't know about. Everything the UI needs comes from the tool itself.

## Development

```bash
# First-time setup
bun install && cd web && bun install

# Local Postgres
bun run db:up        # start (Docker)
bun run db:down      # stop
bun run db:migrate   # apply migrations
bun run db:generate  # generate a migration from schema changes
bun run db:studio    # open Drizzle Studio GUI

# Run the app
bun run dev          # backend with hot reload (:3000)
bun run dev:web      # Vite dev server (:5173, proxies /api → :3000)
bun run cli          # interactive CLI client
bun test             # run tests
bun run fmt          # format (oxfmt); bun run check runs fmt + lint + tsc + tests
```

Most tests are pure unit tests. `server/agent/conversation.test.ts` exercises the real
persistence path and needs a database — it skips itself unless `DATABASE_URL` is reachable,
so run `bun run db:up && bun run db:migrate` first to include it.

Open <http://localhost:5173> for development. Production serves everything from `:3000`.

### Quick start

```bash
bun install
cp .env.example .env   # add your API keys
bun run db:up
bun run db:migrate
bun run dev            # terminal 1
bun run dev:web        # terminal 2 (optional, for the web UI)
```

Talk to Kyle over HTTP:

```bash
curl -X POST http://localhost:3000/chat \
  -H 'Content-Type: application/json' \
  -d '{"message": "Hey Kyle, what can you help me with?"}'
```

## Testing Slack locally

```bash
# Terminal 1
bun run dev

# Terminal 2 — send a message (defaults to localhost:3000)
bun run scripts/test-slack.ts "hello kyle"
bun run scripts/test-slack.ts "follow up" --thread <thread_ts>
bun run scripts/test-slack.ts "hello" --channel <channel_id>

# Against production
BASE_URL=https://kyle.vhtm.eu bun run scripts/test-slack.ts "hello"
```

The script signs requests with `SLACK_SIGNING_SECRET` from `.env`, matching Slack's
signature format, and returns Kyle's response synchronously via the `X-Sync-Response`
header. **The test payload doesn't set `channel_type`, so `shouldProcess` treats it as a
channel message and requires a bot mention** — prefix messages with the bot ID:

```bash
BASE_URL=https://kyle.vhtm.eu bun run scripts/test-slack.ts "<@U099N4BJT5Y> add inception"
```

Streamed replies need `SLACK_TEAM_ID` plus a real `SLACK_TEST_USER` ID, and a `--thread`
anchored to a message that actually exists in Slack — `chat.startStream` rejects synthetic
timestamps. To test streaming, post a real message, then pass its `ts` as `--thread`.

## Schema changes

1. Edit `server/db/schema.ts`.
2. `bun run db:generate` to create the migration file.
3. `bun run db:migrate` to apply locally.
4. Commit both `schema.ts` and the migration.

> **Migration ordering**: Drizzle's migrator sorts by the `when` timestamp in
> `drizzle/meta/_journal.json` and skips any with a timestamp ≤ the max already applied.
> When adding manual migrations alongside generated ones, ensure `when` values are strictly
> increasing, or a later generated migration will be silently skipped in production.

## User management

Users onboard themselves by signing in with Plex; there is no invite step. The Plex server
owner becomes an admin on first sign-in, which is also how the first admin is created.
Passkeys are added afterwards from `/account`, and work as a sign-in method from then on.

```bash
bun run scripts/plex-token.ts                  # obtain a Plex access token by claiming a PIN
```

### Signing in with Plex

Set `PLEX_CLIENT_IDENTIFIER` to enable it. Kyle uses the PIN + forwarding flow from the
[Plex API docs](https://developer.plex.tv/pms/#section/API-Info/Authenticating-with-Plex):

1. `POST /api/auth/plex/login/start` creates a PIN and returns the Auth App URL.
2. The browser signs in at `app.plex.tv` and is forwarded to `/api/auth/plex/callback?state=…`.
3. The callback reads the claimed PIN, fetches the Plex account, and issues Kyle's own JWT cookie.

The `state` is single-use with a 10-minute TTL. **The Plex access token is used once to read the
account identity and then discarded** — Kyle stores no Plex credentials.

A Plex account is stored as a `platform_identities` row with `platform = 'plex'`, keyed on the
numeric plex.tv account id. Existing users connect Plex from `/account`; the flow refuses an
account already linked to someone else.

Signing in for the first time creates the Kyle user automatically, so access to the Plex server
is the invitation. Who qualifies is read from plex.tv and cached for five minutes:

- shared on this server's `machineIdentifier`, with the share accepted, and holding a Plex
  account of their own — managed Home users have no credentials to sign in with;
- plus the server owner, who becomes a Kyle admin.

The check fails closed: if plex.tv cannot be reached nobody new is admitted, though users who
have signed in before are unaffected. Set `PLEX_SERVER_URL` and `PLEX_SERVER_TOKEN` to enable
it; without them Plex sign-in still works, but only for accounts already linked.

### Reading the Plex server (planned)

`scripts/plex-token.ts` obtains the owner token Kyle would use as its service credential. The
following was probed against the live server and is recorded because it is not obvious:

- **Who may sign in** — `GET https://plex.tv/api/users`, filtered to the server's
  `machineIdentifier`, plus the owner from `GET /api/v2/user`. The server's own `/accounts` is
  _not_ the allowlist: it only lists accounts that have played something, so a newly shared user
  would be refused. Managed Home users (no `username`) cannot sign in with Plex and must be
  excluded, though they still need names for attribution.
- **The owner's history is `accountID` 1** — a server records its owner under a local id, not
  their plex.tv account id, so lookups need `plexId === ownerPlexId ? 1 : plexId`. Everyone else
  matches directly.
- **Who watched an item** — `/status/sessions/history/all?metadataItemID=<ratingKey>` returns one
  entry per view carrying `accountID`, readable for every user with the owner token.
- **Matching Kyle's ids to Plex** — `?guid=tmdb://…` matches nothing on current agents; external
  ids live in a `Guid[]` array that is not filterable. Bulk-list sections with `includeGuids=1`
  and index `tmdb://` → `ratingKey`. History can also reference items since removed from the
  library.

Admin API endpoints (require a JWT with `admin: true`):

- `GET /api/users` — list all users with platform identities
- `POST /api/users/:id/links` — link platform identity `{ platform, platformUserId, platformUsername? }` + run retroactive backfill
- `DELETE /api/users/:id/links/:linkId` — unlink platform identity

## Slack app configuration

- **App settings**: managed via manifest at [api.slack.com/apps](https://api.slack.com/apps)
- **Request URL**: `https://kyle.vhtm.eu/slack/events`
- **Bot events**: `message.im`, `message.channels`, `message.groups`, `message.mpim`,
  `assistant_thread_started`, `assistant_thread_context_changed`
- **Bot scopes**: `chat:write`, `app_mentions:read`, `assistant:write`, `im:history`,
  `im:read`, `channels:history`, `groups:history`, `mpim:history`, `users:read`,
  `chat:write.customize`, `incoming-webhook`
- The app uses Slack's **Assistant** feature (assistant events are subscribed but not yet
  handled with the `assistant.threads.*` API).

### Migrating to the Agent messaging experience (`agent_view`)

Slack is deprecating `assistant_view` in favour of `agent_view`, where agent conversations
live in the normal Messages tab. **The switch is irreversible** and only needs app-settings
changes — no server code depends on the assistant events:

1. In [app settings](https://api.slack.com/apps) → **Agent** tab, switch the app to the
   Agent experience (`assistant_view` → `agent_view`; `assistant_description` →
   `agent_description`).
2. Change event subscriptions: drop `assistant_thread_started` and
   `assistant_thread_context_changed`; add `app_home_opened` and `app_context_changed`.
3. Users must hard refresh Slack to see the new experience.

Subscribing to `app_context_changed` makes Slack attach `app_context` to `message.im`, which
Kyle already reads (`describeAppContext` in `server/slack/context.ts`) to tell the agent
what the user is looking at. That code is inert until `agent_view` is on. Resolving a
channel ID to a name also needs the `channels:read` scope; without it the context is dropped
rather than passed to the agent as an opaque ID.

## Environment variables

| Variable                 | Description                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| `DATABASE_URL`           | Postgres connection string (auto-injected in production)                                   |
| `PORT`                   | Server port (default: 3000)                                                                |
| `ANTHROPIC_API_KEY`      | Anthropic API key for Claude                                                               |
| `ANTHROPIC_MODEL`        | Agent model override (default: `claude-sonnet-4-5`); unknown ids fall back to default      |
| `JWT_SECRET`             | High-entropy secret for JWT signing (required)                                             |
| `WEBAUTHN_RP_ID`         | WebAuthn relying party ID (`localhost` dev / `kyle.vhtm.eu` prod)                          |
| `WEBAUTHN_ORIGIN`        | WebAuthn origin URL (`http://localhost:5173` dev / `https://kyle.vhtm.eu` prod)            |
| `PUBLIC_ORIGIN`          | Public origin for redirects back from Plex (defaults to `WEBAUTHN_ORIGIN`)                 |
| `PLEX_CLIENT_IDENTIFIER` | Stable random string identifying Kyle to Plex (optional; disables Plex sign-in when unset) |
| `PLEX_SERVER_URL`        | Plex Media Server address, used to identify which server grants access                     |
| `PLEX_SERVER_TOKEN`      | Plex owner token (see `scripts/plex-token.ts`); enables sign-up from server access         |
| `SLACK_BOT_TOKEN`        | Slack bot token (`xoxb-...`)                                                               |
| `SLACK_SIGNING_SECRET`   | Slack app signing secret for request verification                                          |
| `SONARR_HOST`            | Sonarr instance URL                                                                        |
| `SONARR_API_KEY`         | Sonarr API key                                                                             |
| `RADARR_HOST`            | Radarr instance URL                                                                        |
| `RADARR_API_KEY`         | Radarr API key                                                                             |
| `TMDB_API_TOKEN`         | TMDB API bearer token                                                                      |
| `ULTRA_HOST`             | Ultra seedbox URL (e.g. `https://user.host.usbx.me`)                                       |
| `ULTRA_API_TOKEN`        | Ultra API bearer token                                                                     |
| `QBITTORRENT_HOST`       | qBittorrent Web UI URL                                                                     |
| `QBITTORRENT_USERNAME`   | qBittorrent username                                                                       |
| `QBITTORRENT_PASSWORD`   | qBittorrent password                                                                       |
| `BRAVE_API_KEY`          | Brave Search API key                                                                       |
| `WEBHOOK_AUTH`           | Basic auth credentials for webhook endpoints (`username:password`)                         |
| `CHAT_API_KEY`           | Bearer token for `/chat` (optional, skipped if unset)                                      |
| `DISCORD_BOT_TOKEN`      | Discord bot token (optional; skips gracefully if unset)                                    |
| `THREAD_VIEWER_TOKEN`    | Shared secret for `?sig=` thread share links (HMAC-SHA256)                                 |

## API reference

| Endpoint                              | Auth                  | Description                                     |
| ------------------------------------- | --------------------- | ----------------------------------------------- |
| `GET /health`                         | —                     | Health check (includes DB status + `deployId`)  |
| `POST /chat`                          | `CHAT_API_KEY` bearer | Send a message, get a response                  |
| `POST /slack/events`                  | Slack signature       | Slack event ingress; supports `X-Sync-Response` |
| `POST /webhooks/sonarr`               | `WEBHOOK_AUTH` basic  | Sonarr webhook handler                          |
| `POST /webhooks/radarr`               | `WEBHOOK_AUTH` basic  | Radarr webhook handler                          |
| `GET /api/discover?q=`                | JWT                   | Search TMDB for something to request            |
| `POST /api/requests`                  | JWT                   | Request a title `{ mediaType, tmdbId }`         |
| `GET /api/requests`                   | JWT                   | Your requests, or all with `?all=true` as admin |
| `GET /api/library`                    | JWT                   | Everything Radarr and Sonarr hold               |
| `DELETE /api/library/:type/:id`       | Admin                 | Remove an item, deleting files unless disabled  |
| `GET /api/threads`                    | JWT                   | List conversation threads                       |
| `GET /api/threads/:uuid`              | JWT / `?sig=`         | Fetch a single thread's messages                |
| `GET /api/auth/status`                | JWT cookie            | Current user + admin flag                       |
| `POST /api/auth/logout`               | JWT cookie            | Clear the session cookie                        |
| `POST /api/auth/passkey/*`            | —                     | WebAuthn registration/authentication            |
| `POST /api/auth/plex/login/start`     | —                     | Begin Plex sign-in; returns the Auth App URL    |
| `POST /api/auth/plex/link/start`      | JWT cookie            | Begin connecting Plex to the current account    |
| `DELETE /api/auth/plex/link`          | JWT cookie            | Disconnect the linked Plex account              |
| `GET /api/auth/plex/callback`         | `state`               | Where Plex forwards back to; sets the session   |
| `GET /api/users`                      | Admin                 | List users + platform identities                |
| `POST /api/users/:id/links`           | Admin                 | Link a platform identity                        |
| `DELETE /api/users/:id/links/:linkId` | Admin                 | Unlink a platform identity                      |

Requests larger than 1 MB are rejected with a `413` by `Bun.serve`'s `maxRequestBodySize`.

### POST /chat

```json
// Request
{ "message": "string", "conversationId?": "uuid", "userId?": "string" }

// Response
{ "conversationId": "uuid", "response": "string" }
```

Omit `conversationId` to start a new conversation; include it to continue an existing one.

## Web thread viewer

The Vue SPA (views: `/threads`, `/threads/:id`, `/login`, `/account`) lets
authenticated users browse past conversations. It renders user/assistant/tool-use blocks,
webhook notification cards, media-action summaries, collapsible tool calls, and relative
timestamps. Threads are shareable via signed `?sig=` links (`THREAD_VIEWER_TOKEN`).

## Deployment

Production is live at <https://kyle.vhtm.eu>, hosted on the shared `vhtm-eu` exe.dev VM.
VM-wide architecture and conventions live at <https://github.com/Jason-vh/vhtm.eu>.

```text
client / Slack / Discord / Sonarr / Radarr webhooks
  → https://kyle.vhtm.eu
  → exe.dev edge (TLS termination)
  → vhtm-eu VM :8080
  → Caddy (host-matched via deploy/caddy.snippet)
  → 127.0.0.1:3003
  → kyle Bun process (HTTP server + Discord bot)
  → shared Postgres on the apps-net Docker network (DB: kyle)
```

The Vue SPA is built into `web/dist/` and served as static files by the same Bun process.
`deploy/caddy.snippet` routes `kyle.vhtm.eu → 127.0.0.1:3003`; `deploy/env.production.example`
shows the shape of `.env.production` (written by CI from secrets, never committed).

### One-time setup

```bash
# Register the hostname with the exe.dev edge
ssh exe.dev domain add vhtm-eu kyle.vhtm.eu

# DNS at Porkbun: kyle.vhtm.eu  CNAME  vhtm-eu.exe.xyz
```

### Deploy flow

Every push to `main`:

1. Runs on the self-hosted runner labeled `kyle-prod` (`gh-actions-runner-kyle.service`).
2. Writes `.env.production` from GitHub Actions secrets.
3. Copies the checkout into `/home/exedev/apps/kyle`.
4. `docker compose build` — multi-stage image (web SPA + server).
5. **Migrations**: `docker compose run --rm app bun run server/db/migrate.ts` in a one-shot
   container. On failure the previous deploy keeps serving.
6. `docker compose up -d --remove-orphans` — starts the long-running app.
7. `caddy validate` + `systemctl reload caddy` so changes to `deploy/caddy.snippet` apply.

`WEBAUTHN_ORIGIN` / `WEBAUTHN_RP_ID` matter for passkeys — passkeys are origin-bound, so
production sign-in must happen on `https://kyle.vhtm.eu`.

### Operations

```bash
ssh vhtm-eu.exe.xyz
cd /home/exedev/apps/kyle

docker compose ps                                              # container status
docker compose logs -f app                                     # app logs (server + Discord bot)
docker compose restart app                                     # restart
docker compose run --rm app bun run server/db/migrate.ts       # run migrations manually
```

Open a DB shell as the `kyle` role:

```bash
docker compose -f /home/exedev/infra/postgres/docker-compose.yml exec postgres psql -U kyle -d kyle
```

### Health check

```bash
curl https://kyle.vhtm.eu/health
```

Returns JSON including `deployId` — the commit SHA the running container was built from
(`dev` when `DEPLOY_ID` is unset, e.g. local runs). Compare against `git rev-parse HEAD` to
confirm a deploy landed.

### GitHub Actions secrets

This repo is public, so most app config lives in GitHub Actions secrets:

| Secret                                                              | Purpose                                       |
| ------------------------------------------------------------------- | --------------------------------------------- |
| `KYLE_DB_PASSWORD`                                                  | Password for the `kyle` Postgres role         |
| `JWT_SECRET`, `CHAT_API_KEY`, `THREAD_VIEWER_TOKEN`, `WEBHOOK_AUTH` | App-level auth tokens / secrets               |
| `ANTHROPIC_API_KEY`, `BRAVE_API_KEY`                                | LLM + search                                  |
| `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`                           | Slack bot + event signature verification      |
| `DISCORD_BOT_TOKEN`                                                 | Discord bot login                             |
| `RADARR_HOST`, `RADARR_API_KEY`                                     | Radarr integration                            |
| `SONARR_HOST`, `SONARR_API_KEY`                                     | Sonarr integration                            |
| `TMDB_API_TOKEN`                                                    | TMDB lookups                                  |
| `QBITTORRENT_HOST`, `QBITTORRENT_USERNAME`, `QBITTORRENT_PASSWORD`  | qBittorrent UI                                |
| `ULTRA_HOST`, `ULTRA_API_TOKEN`                                     | Ultra seedbox                                 |
| `PLEX_CLIENT_IDENTIFIER`                                            | Identifies Kyle to Plex; enables Plex sign-in |
| `PLEX_SERVER_URL`, `PLEX_SERVER_TOKEN`                              | Plex server address + owner token             |

## Conventions

- **Runtime**: Bun — `bun run`, `bun test`, `bun install`. Bun auto-loads `.env`.
- **HTTP**: `Bun.serve()` — no Express.
- **Database**: `postgres` package with Drizzle ORM — no `pg`.
- **File I/O**: prefer `Bun.file` over `node:fs`.
- **Slack**: `@slack/web-api` only (no Bolt). Signature verification uses `crypto.subtle`.
- **Discord**: `discord.js` with Gateway WebSocket, running in-process; optional.
- **Formatting**: `oxfmt` via `bun run fmt`. Pre-commit hook (`lefthook`) runs
  `oxfmt --check`, `oxlint`, `tsc --noEmit -p tsconfig.server.json`, and `vue-tsc --noEmit`
  (in `web/`). Always run `bun run fmt` before committing.
- **Type safety**: type assertions (`as any`) are not allowed unless absolutely necessary —
  use type guards, generics, `WeakMap`, etc. Service clients return `request<T>()`, so tool
  code should not need casts.
- **Tests**: `bun test`. Keep them pure where possible; tests that need Postgres must skip
  themselves when `DATABASE_URL` is unreachable so `bun run check` passes without Docker.
  `mock.module` replaces a module for the whole run, so spread the real one and override only
  what the test needs.
- **Errors**: surface the real message rather than a tidy one — `errorResponse(error, status)`
  from `server/errors.ts`. Kyle sits behind auth and is used by a household, so a reply of
  "op ANY/ALL (array) requires array on right side" is worth far more than "unavailable right
  now", which forces a trip to the server logs to learn anything at all.
- **Git workflow**: push to `main`; the self-hosted runner deploys automatically.
- **Comments/docstrings**: keep them as short as possible, ideally a single line, and never
  include ticket references.

## Task tracking

We use [Linear](https://linear.app) for task tracking. The `linear` CLI is installed and
authenticated.

```bash
linear issue list --team KYL --sort priority --all-assignees           # open issues
linear issue list --team KYL --sort priority --all-assignees --all-states
linear issue view <id>
linear issue create --team KYL
linear issue update <id> -s started
linear issue update <id> -s completed
```

Use `TODO(KYL-123)` comments in code to mark where work is needed. When identifying new
work (bugs, enhancements, refactors), create a Linear issue and add a TODO at the location.
