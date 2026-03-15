# Kyle

AI-powered Plex media library assistant. Uses pi-agent-core with Anthropic Claude, persists conversations in Postgres via Drizzle ORM, deployed on Railway.

## Architecture

```
index.ts                    → entry point (Bun.serve)
cli.ts                      → interactive CLI client
create-admin.ts             → CLI: bootstrap first admin user + invite link
invite.ts                   → CLI: create invite link for existing admin
test-slack.ts               → Send test messages to /slack/events (sync response by default)
deploy.sh                   → Deploy to Railway with deploy ID verification
tsconfig.server.json        → Server TypeScript config (scoped to server/ + shared/)

shared/
  types.ts                  → API response types shared between server + web

server/
  server.ts                 → HTTP routing (/api/*, /slack, /webhooks, SPA serving)
  logger.ts                 → Structured JSON logger
  auth/
    jwt.ts                  → JWT sign/verify (jose), httpOnly cookie, sliding window refresh
    middleware.ts            → requireAuth, requireAdmin, optionalAuth helpers
    webauthn.ts             → WebAuthn registration/authentication (simplewebauthn)
  agent/
    index.ts                → Agent factory + runAgent(), tool registration
    system-prompt.ts        → Kyle's system prompt + AgentContext
    requests-tool.ts        → get_requests_for_user tool (queries subscriptions by app user UUID)
    unsubscribe-tool.ts     → unsubscribe_notifications tool (deactivates subscriptions by Radarr/Sonarr ID)
  db/
    index.ts                → Drizzle + postgres connection
    schema.ts               → All tables: users, platform_identities, user_credentials, user_invites, conversations, messages, media_events, movie_subscriptions, series_subscriptions
    users.ts                → Platform identity resolution (cached), backfill, user CRUD
    media-events.ts         → Media event extraction from tool results + persistence
    subscriptions.ts        → Movie/series subscription CRUD, webhook subscriber lookup, processMediaEvent helper
    migrate.ts              → Migration runner
  routes/
    chat.ts                 → POST /chat handler
    health.ts               → GET /health handler (includes deployId for deploy verification)
    slack-events.ts         → POST /slack/events handler (supports X-Sync-Response header)
    threads-auth.ts         → HMAC-SHA256 thread sharing signatures (?sig= URLs)
    api/
      threads.ts            → GET /api/threads, GET /api/threads/:uuid
      auth.ts               → GET /api/auth/status, POST /api/auth/logout
      auth-passkey.ts       → Passkey login/register endpoints
      invites.ts            → Invite validation, redemption, creation (admin)
      users.ts              → User listing, platform link management (admin)
  slack/
    client.ts               → WebClient singleton (lazy-init from SLACK_BOT_TOKEN)
    verify.ts               → HMAC-SHA256 signature verification
    events.ts               → Event types + helpers (shouldProcess, cleanMessageText, buildExternalId)
    users.ts                → Slack user ID → display name resolution
  discord/
    client.ts               → Discord.js Client singleton (Gateway connection, lazy-init from DISCORD_BOT_TOKEN)
    events.ts               → messageCreate handler (DM, thread, @mention → thread creation)
    users.ts                → Discord display name resolution (single + batch)
  sonarr/
    types.ts                → Sonarr API type definitions
    api.ts                  → Sonarr API client (series, episodes, queue, calendar, history)
    utils.ts                → Token optimization helpers (toPartialSeries, toPartialEpisode, etc.)
    tools.ts                → 11 Sonarr agent tools
  radarr/
    types.ts                → Radarr API type definitions
    api.ts                  → Radarr API client (movies, queue, history)
    utils.ts                → Token optimization helpers (toPartialMovie, etc.)
    tools.ts                → 7 Radarr agent tools
  tmdb/
    types.ts                → TMDB API type definitions
    api.ts                  → TMDB API client (search, details)
    utils.ts                → Token optimization helpers (toPartialMovie, toPartialTVShow, etc.)
    tools.ts                → 5 TMDB agent tools
  ultra/
    api.ts                  → Ultra seedbox API client (stats)
    tools.ts                → 1 Ultra agent tool
  qbittorrent/
    api.ts                  → qBittorrent API client (cookie auth, torrents)
    tools.ts                → 2 qBittorrent agent tools
  brave/
    types.ts                → Brave Web Search API type definitions
    api.ts                  → Brave Search API client (web search)
    utils.ts                → Token optimization helpers (toPartialWebResult)
    tools.ts                → 1 Brave Search agent tool
  webhooks/
    types.ts                → Webhook payload types + MediaNotificationInfo
    requester.ts            → Find who requested media (subscription tables + conversations query)
    notifications.ts        → AI notification generation via Haiku (fallback to template)
    handler.ts              → POST /webhooks/sonarr + /webhooks/radarr handlers

web/                        → Vue 3 + Vite + Tailwind CSS 4 SPA
  package.json              → Vue, vue-router, vite, tailwindcss, @simplewebauthn/browser
  tsconfig.json             → Vue TS config with @shared alias
  vite.config.ts            → Proxy /api → localhost:3000
  index.html                → SPA shell
  src/
    main.ts                 → App bootstrap
    main.css                → Tailwind v4 @import + @theme palette
    App.vue                 → <RouterView>
    router.ts               → /threads, /threads/:id, /login, /invite/:code + auth guard
    api/
      client.ts             → Fetch wrapper, 401 → redirect to /login
      threads.ts            → getThreads(), getThread(id, sig?)
      auth.ts               → getAuthStatus(), getCachedUser(), logout()
      passkey.ts            → passkeyLogin(), passkeyRegisterExisting()
      invites.ts            → validateInvite(), redeemInvite()
    composables/
      useRelativeTime.ts    → Reactive relative timestamps
    components/
      ThreadCard.vue        → Thread list card
      MessageBlock.vue      → Dispatches user/assistant/tool-use/error
      ToolCallBlock.vue     → Clickable <details> with summary
      WebhookBlock.vue      → Sonarr/Radarr notification card
      MediaRefsSummary.vue  → Media actions summary
      DateSeparator.vue     → Day boundary divider
      UserAvatar.vue        → Color-hashed avatar (Kyle gets purple "K")
      MarkdownContent.vue   → v-html with renderMarkdown()
    views/
      ThreadListView.vue    → Search + thread card list
      ThreadDetailView.vue  → Messages + webhooks + media refs
      LoginView.vue         → Passkey login
      InviteView.vue        → Invite redemption + passkey registration
    utils/
      markdown.ts           → Port of renderMarkdown (escape-first security model)
      toolSummary.ts        → Fallback tool summary (server provides summaryText)

drizzle/                    → Generated migration SQL
drizzle.config.ts           → Drizzle Kit config
```

## Key Patterns

- **Stateless agent**: Agent is created per-request. Previous messages are loaded from DB and restored via `agent.replaceMessages()`.
- **JSONB messages**: Full `AgentMessage` objects stored as JSONB in the `messages` table. The `role` and `sequence` columns exist for querying and ordering.
- **Interface-agnostic conversations**: The `conversations` table has an `interfaceType` field (http/slack/discord/cli) so multiple frontends can share the same backend. Slack conversations are keyed by `externalId` = `"{channel}:{thread_ts}"`. Discord conversations use `"dm:{channelId}"` or `"thread:{threadId}"`.
- **User identity**: First-class `users` table with UUIDs, linked to platform identities (Slack/Discord) via `platform_identities`. Each conversation, message, and media event has both a `platformUserId` (text, the raw Slack/Discord ID) and a `userId` (uuid FK → users). Slack/Discord handlers resolve the app user via `resolveAppUserId()` (cached in-memory Map). The thread viewer prefers app user `displayName` over platform API names.
- **Media events + subscriptions**: `media_events` is an append-only event log of tool actions (add, remove, download). `movie_subscriptions` and `series_subscriptions` track notification preferences — created on add/download, deactivated on remove/unsubscribe. Series subscriptions support season/episode granularity via partial unique indexes. Webhook notifications query subscription tables (not events) to find who to notify.
- **Agent decoupling**: The agent only sees app user UUIDs and display names — never platform-specific IDs. `AgentContext.userId` is the app user UUID. The `get_requests_for_user` tool queries by `user_id` FK, not platform ID.
- **Auth: Passkeys + JWT**: Users authenticate via WebAuthn passkeys. JWT sessions (`jose`, HS256) stored in httpOnly `kyle_auth` cookie with 30-day expiry and sliding window refresh at 15 days. Admin-generated invite links for onboarding new users. Thread sharing uses separate `?sig=` HMAC signatures (unchanged, uses `THREAD_VIEWER_TOKEN`).
- **Slack immediate ack**: The `/slack/events` handler returns 200 immediately and processes the message async (fire-and-forget) to stay within Slack's 3-second timeout. Responses are always posted as thread replies.
- **Slack sync mode**: Sending `X-Sync-Response: true` header makes `/slack/events` wait for the agent and return the response in the HTTP body (used by `test-slack.ts` for dev workflow).
- **Slack dedup**: In-memory `Set<string>` on `event_id` (capped at 10k entries) + `X-Slack-Retry-Num` header skipping prevents duplicate processing.
- **Structured logging**: `createLogger(module)` from `server/logger.ts` emits JSON lines with `level`, `module`, `msg`, `timestamp` + contextual fields. Use throughout — no raw `console.log`.
- **Token optimization**: Each service has `utils.ts` with `toPartial*` helpers that strip large API responses down to essential fields before sending to the LLM.
- **Adding new tools**: Create `api.ts` and `tools.ts` under `server/<service>/`. Register tools in `server/agent/index.ts` (add to imports + `allTools` array). Also add the service to the media architecture list in `server/agent/system-prompt.ts` — the agent won't use tools it doesn't know about. Add a human-readable summary case in the `toolSummary` switch in both `server/routes/api/threads.ts` and `web/src/utils/toolSummary.ts` — without this, the web UI falls back to the raw tool name.
- **SPA serving**: In production, `server/server.ts` serves `web/dist/` static files. Hashed `/assets/*` get immutable caching; `index.html` gets `no-cache`. SPA routes (`/`, `/threads/*`, `/login`, `/invite/*`) fall through to `index.html`.
- **Shared types**: `shared/types.ts` defines API response types used by both the server API routes and the Vue frontend. Imported as `@shared/types` in web code.

## Development

```bash
bun run db:up        # Start Postgres (Docker)
bun run db:migrate   # Run migrations
bun run dev          # Run server with hot reload (:3000)
bun run dev:web      # Run Vite dev server (:5173, proxies /api → :3000)
bun run cli          # Interactive CLI client

bun run db:down      # Stop Postgres
bun run db:studio    # Open Drizzle Studio GUI
```

### First-time setup

```bash
bun install && cd web && bun install
```

### Dev workflow

```bash
# Terminal 1 — backend
bun run dev

# Terminal 2 — frontend with HMR
bun run dev:web
```

Open `http://localhost:5173` for development. Production serves everything from `:3000`.

### Testing Slack Locally

```bash
# Terminal 1
bun run dev

# Terminal 2 — send a message (defaults to localhost:3000)
bun run test-slack.ts "hello kyle"
bun run test-slack.ts "follow up" --thread <thread_ts>
bun run test-slack.ts "hello" --channel <channel_id>

# Against production
BASE_URL=https://kyle.vhtm.eu bun run test-slack.ts "hello"
```

The test script signs requests using `SLACK_SIGNING_SECRET` from `.env`, matching Slack's signature format. Messages sent this way will trigger real agent processing and post responses to Slack. Kyle's response is returned synchronously in the terminal via `X-Sync-Response` header.

**Important**: The test payload doesn't set `channel_type`, so `shouldProcess` treats it as a channel message and requires a bot mention. Prefix messages with `<@U099N4BJT5Y>`:

```bash
BASE_URL=https://kyle.vhtm.eu bun run test-slack.ts "<@U099N4BJT5Y> add inception"
```

### Schema Changes

1. Edit `server/db/schema.ts`
2. `bun run db:generate` to create migration file
3. `bun run db:migrate` to apply locally
4. Commit both schema.ts and the migration

**Migration ordering**: Drizzle's migrator sorts migrations by the `when` timestamp in `drizzle/meta/_journal.json` and skips any with a timestamp <= the max already applied. When adding manual migrations alongside generated ones, ensure `when` values are strictly increasing. If a manual migration gets a higher timestamp than a later generated one, the generated one will be silently skipped in production.

### User Management

```bash
# Bootstrap first admin (creates user + prints invite link)
bun run create-admin.ts "Admin Name"

# Create invite for new user (requires existing admin user ID)
bun run invite.ts "Display Name"
```

Admin API endpoints (require JWT with `admin: true`):

- `POST /api/invites` — create invite `{ displayName, isAdmin?, expiresInDays? }`
- `GET /api/users` — list all users with platform identities
- `POST /api/users/:id/links` — link platform identity `{ platform, platformUserId, platformUsername? }` + run retroactive backfill
- `DELETE /api/users/:id/links/:linkId` — unlink platform identity

## Slack App Configuration

- **App settings**: Managed via manifest at [api.slack.com/apps](https://api.slack.com/apps)
- **Request URL**: `https://kyle.vhtm.eu/slack/events`
- **Bot events**: `message.im`, `message.channels`, `message.groups`, `message.mpim`, `assistant_thread_started`, `assistant_thread_context_changed`
- **Bot scopes**: `chat:write`, `app_mentions:read`, `assistant:write`, `im:history`, `im:read`, `channels:history`, `groups:history`, `mpim:history`, `users:read`, `chat:write.customize`, `incoming-webhook`
- The app uses Slack's **Assistant** feature (assistant events are subscribed but not yet handled with the `assistant.threads.*` API)

## Environment Variables

| Variable               | Description                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| `DATABASE_URL`         | Postgres connection string (auto-injected by Railway in production)                      |
| `PORT`                 | Server port (default: 3000)                                                              |
| `ANTHROPIC_API_KEY`    | Anthropic API key for Claude                                                             |
| `JWT_SECRET`           | High-entropy secret for JWT signing (required, server refuses to start without it)       |
| `WEBAUTHN_RP_ID`       | WebAuthn relying party ID (default: `localhost` dev / `kyle.vhtm.eu` prod)               |
| `WEBAUTHN_ORIGIN`      | WebAuthn origin URL (default: `http://localhost:5173` dev / `https://kyle.vhtm.eu` prod) |
| `SLACK_BOT_TOKEN`      | Slack bot token (`xoxb-...`)                                                             |
| `SLACK_SIGNING_SECRET` | Slack app signing secret for request verification                                        |
| `SONARR_HOST`          | Sonarr instance URL                                                                      |
| `SONARR_API_KEY`       | Sonarr API key                                                                           |
| `RADARR_HOST`          | Radarr instance URL                                                                      |
| `RADARR_API_KEY`       | Radarr API key                                                                           |
| `TMDB_API_TOKEN`       | TMDB API bearer token                                                                    |
| `ULTRA_HOST`           | Ultra seedbox URL (e.g. `https://user.host.usbx.me`)                                     |
| `ULTRA_API_TOKEN`      | Ultra API bearer token                                                                   |
| `QBITTORRENT_HOST`     | qBittorrent Web UI URL                                                                   |
| `QBITTORRENT_USERNAME` | qBittorrent username                                                                     |
| `QBITTORRENT_PASSWORD` | qBittorrent password                                                                     |
| `BRAVE_API_KEY`        | Brave Search API key for web search                                                      |
| `WEBHOOK_AUTH`         | Basic auth credentials for webhook endpoints (`username:password`)                       |
| `CHAT_API_KEY`         | Bearer token for `/chat` endpoint auth (optional, skipped if unset)                      |
| `DISCORD_BOT_TOKEN`    | Discord bot token (optional, from Discord Developer Portal)                              |
| `THREAD_VIEWER_TOKEN`  | Shared secret for `?sig=` thread share links (HMAC-SHA256)                               |

## Task Tracking

We use [Linear](https://linear.app) for task tracking. The Linear CLI (`linear`) is installed and authenticated.

```bash
linear issue list --team KYL --sort priority --all-assignees                    # List open issues
linear issue list --team KYL --sort priority --all-assignees --all-states       # All issues including completed
linear issue view <id>                                                          # View issue details
linear issue create --team KYL                                                  # Create new issue
linear issue update <id> -s started                                             # Start working on an issue
linear issue update <id> -s completed                                           # Mark complete
```

Use `TODO(KYL-123)` comments in code to mark where work is needed, linking to the relevant Linear issue. When identifying new work (bugs, enhancements, refactors), create a Linear issue and add a TODO comment at the relevant location in code.

## Conventions

- **Runtime**: Bun — use `bun run`, `bun test`, `bun install`. Bun auto-loads `.env`.
- **HTTP**: `Bun.serve()` — no Express.
- **Database**: `postgres` package with Drizzle ORM — no `pg`.
- **File I/O**: Prefer `Bun.file` over `node:fs`.
- **Deployment**: Pushes to `main` auto-deploy via Railway RAILPACK builder. `buildCommand` builds the Vue SPA (`cd web && bun install && bun run build`). Migrations run via pre-deploy command. Health check at `/health`. Live at https://kyle.vhtm.eu. Logs: `railway logs -n 80`.
- **Production DB**: The Railway DATABASE_URL uses internal networking (not reachable locally). Use `echo "SELECT ..." | railway connect kyle-db` to query production. The messages table stores agent messages as JSONB in a `data` column.
- **Slack**: `@slack/web-api` only (no Bolt). Signature verification uses `crypto.subtle` (native in Bun).
- **Discord**: `discord.js` with Gateway WebSocket. Runs in-process alongside the HTTP server. Optional — skips gracefully if `DISCORD_BOT_TOKEN` is unset.
- **Formatting**: `oxfmt` via `bun run fmt`. Pre-commit hook (`lefthook`) runs `oxfmt --check`, `oxlint`, `tsc --noEmit -p tsconfig.server.json`, and `vue-tsc --noEmit` (in `web/`). Always run `bun run fmt` before committing.
- **Type safety**: Type assertions (`as any`, `as Type`) are not allowed unless absolutely necessary. Use type guards, generics, `WeakMap`, or other patterns to maintain type safety.
- **Git workflow**: Commit and push to `main` — Railway deploys automatically via GitHub integration.
- **Linear**: Update issue status (`linear issue update <id> -s completed`) when work is committed.
