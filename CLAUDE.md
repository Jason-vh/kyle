# Kyle

AI-powered Plex media library assistant. Uses pi-agent-core with Anthropic Claude, persists conversations in Postgres via Drizzle ORM, deployed on Railway.

## Architecture

```
index.ts                    → entry point (Bun.serve)
cli.ts                      → interactive CLI client
test-slack.ts               → Send test messages to /slack/events (sync response by default)
deploy.sh                   → Deploy to Railway with deploy ID verification
src/
  server.ts                 → HTTP routing
  logger.ts                 → Structured JSON logger
  agent/
    index.ts                → Agent factory + runAgent(), tool registration
    system-prompt.ts        → Kyle's system prompt
  db/
    index.ts                → Drizzle + postgres connection
    schema.ts               → conversations + messages + media_refs tables
    media-refs.ts           → Media ref extraction from tool events + persistence
    migrate.ts              → Migration runner
  routes/
    chat.ts                 → POST /chat handler
    health.ts               → GET /health handler (includes deployId for deploy verification)
    slack-events.ts         → POST /slack/events handler (supports X-Sync-Response header)
    threads.ts              → GET /threads/:thread_ts handler (server-rendered thread viewer)
    threads-auth.ts         → Cookie-based auth (HMAC-SHA256 signed cookies, login form)
    threads-render.ts       → HTML rendering for thread messages (dark theme, tool call pairing)
  slack/
    client.ts               → WebClient singleton (lazy-init from SLACK_BOT_TOKEN)
    verify.ts               → HMAC-SHA256 signature verification
    events.ts               → Event types + helpers (shouldProcess, cleanMessageText, buildExternalId)
    users.ts                → Slack user ID → display name resolution
  discord/
    client.ts               → Discord.js Client singleton (Gateway connection, lazy-init from DISCORD_BOT_TOKEN)
    events.ts               → messageCreate handler (DM, thread, @mention → thread creation)
    users.ts                → Discord display name resolution
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
    requester.ts            → Find who requested media (media_refs + conversations query)
    notifications.ts        → AI notification generation via Haiku (fallback to template)
    handler.ts              → POST /webhooks/sonarr + /webhooks/radarr handlers
drizzle/                    → Generated migration SQL
drizzle.config.ts           → Drizzle Kit config
```

## Key Patterns

- **Stateless agent**: Agent is created per-request. Previous messages are loaded from DB and restored via `agent.replaceMessages()`.
- **JSONB messages**: Full `AgentMessage` objects stored as JSONB in the `messages` table. The `role` and `sequence` columns exist for querying and ordering.
- **Interface-agnostic conversations**: The `conversations` table has an `interfaceType` field (http/slack/discord/cli) so multiple frontends can share the same backend. Slack conversations are keyed by `externalId` = `"{channel}:{thread_ts}"`. Discord conversations use `"dm:{channelId}"` or `"thread:{threadId}"`.
- **Slack immediate ack**: The `/slack/events` handler returns 200 immediately and processes the message async (fire-and-forget) to stay within Slack's 3-second timeout. Responses are always posted as thread replies.
- **Slack sync mode**: Sending `X-Sync-Response: true` header makes `/slack/events` wait for the agent and return the response in the HTTP body (used by `test-slack.ts` for dev workflow).
- **Slack dedup**: In-memory `Set<string>` on `event_id` (capped at 10k entries) + `X-Slack-Retry-Num` header skipping prevents duplicate processing.
- **Structured logging**: `createLogger(module)` from `src/logger.ts` emits JSON lines with `level`, `module`, `msg`, `timestamp` + contextual fields. Use throughout — no raw `console.log`.
- **Token optimization**: Each service has `utils.ts` with `toPartial*` helpers that strip large API responses down to essential fields before sending to the LLM.
- **Adding new tools**: Create `api.ts` and `tools.ts` under `src/<service>/`. Register tools in `src/agent/index.ts` (add to imports + `allTools` array). Also add the service to the media architecture list in `src/agent/system-prompt.ts` — the agent won't use tools it doesn't know about.

## Development

```bash
bun run db:up        # Start Postgres (Docker)
bun run db:migrate   # Run migrations
bun run dev          # Run with hot reload
bun run cli          # Interactive CLI client

bun run db:down      # Stop Postgres
bun run db:studio    # Open Drizzle Studio GUI
```

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

1. Edit `src/db/schema.ts`
2. `bun run db:generate` to create migration file
3. `bun run db:migrate` to apply locally
4. Commit both schema.ts and the migration

## Slack App Configuration

- **App settings**: Managed via manifest at [api.slack.com/apps](https://api.slack.com/apps)
- **Request URL**: `https://kyle.vhtm.eu/slack/events`
- **Bot events**: `message.im`, `message.channels`, `message.groups`, `message.mpim`, `assistant_thread_started`, `assistant_thread_context_changed`
- **Bot scopes**: `chat:write`, `app_mentions:read`, `assistant:write`, `im:history`, `im:read`, `channels:history`, `groups:history`, `mpim:history`, `users:read`, `chat:write.customize`, `incoming-webhook`
- The app uses Slack's **Assistant** feature (assistant events are subscribed but not yet handled with the `assistant.threads.*` API)

## Environment Variables

| Variable               | Description                                                         |
| ---------------------- | ------------------------------------------------------------------- |
| `DATABASE_URL`         | Postgres connection string (auto-injected by Railway in production) |
| `PORT`                 | Server port (default: 3000)                                         |
| `ANTHROPIC_API_KEY`    | Anthropic API key for Claude                                        |
| `SLACK_BOT_TOKEN`      | Slack bot token (`xoxb-...`)                                        |
| `SLACK_SIGNING_SECRET` | Slack app signing secret for request verification                   |
| `SONARR_HOST`          | Sonarr instance URL                                                 |
| `SONARR_API_KEY`       | Sonarr API key                                                      |
| `RADARR_HOST`          | Radarr instance URL                                                 |
| `RADARR_API_KEY`       | Radarr API key                                                      |
| `TMDB_API_TOKEN`       | TMDB API bearer token                                               |
| `ULTRA_HOST`           | Ultra seedbox URL (e.g. `https://user.host.usbx.me`)                |
| `ULTRA_API_TOKEN`      | Ultra API bearer token                                              |
| `QBITTORRENT_HOST`     | qBittorrent Web UI URL                                              |
| `QBITTORRENT_USERNAME` | qBittorrent username                                                |
| `QBITTORRENT_PASSWORD` | qBittorrent password                                                |
| `BRAVE_API_KEY`        | Brave Search API key for web search                                 |
| `WEBHOOK_AUTH`         | Basic auth credentials for webhook endpoints (`username:password`)  |
| `CHAT_API_KEY`         | Bearer token for `/chat` endpoint auth (optional, skipped if unset) |
| `DISCORD_BOT_TOKEN`    | Discord bot token (optional, from Discord Developer Portal)         |
| `THREAD_VIEWER_TOKEN`  | Shared secret for thread viewer auth (cookie-based login)           |

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
- **Deployment**: Pushes to `main` auto-deploy via Railway's built-in GitHub integration. Migrations run via pre-deploy command. Health check at `/health`. Live at https://kyle.vhtm.eu. Logs: `railway logs -n 80`.
- **Production DB**: The Railway DATABASE_URL uses internal networking (not reachable locally). Use `echo "SELECT ..." | railway connect kyle-db` to query production. The messages table stores agent messages as JSONB in a `data` column.
- **Slack**: `@slack/web-api` only (no Bolt). Signature verification uses `crypto.subtle` (native in Bun).
- **Discord**: `discord.js` with Gateway WebSocket. Runs in-process alongside the HTTP server. Optional — skips gracefully if `DISCORD_BOT_TOKEN` is unset.
- **Git workflow**: Commit and push to `main` — Railway deploys automatically via GitHub integration.
- **Linear**: Update issue status (`linear issue update <id> -s completed`) when work is completed.
