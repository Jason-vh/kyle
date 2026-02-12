# Kyle

AI-powered Plex media library assistant. Uses pi-agent-core with Anthropic Claude, persists conversations in Postgres via Drizzle ORM, deployed on Railway.

## Architecture

```
index.ts                    → entry point (Bun.serve)
cli.ts                      → interactive CLI client
test-slack.ts               → Send test messages to /slack/events (sync response by default)
src/
  server.ts                 → HTTP routing
  logger.ts                 → Structured JSON logger
  agent/
    index.ts                → Agent factory + runAgent(), tool registration
    system-prompt.ts        → Kyle's system prompt (ported from v1)
  db/
    index.ts                → Drizzle + postgres connection
    schema.ts               → conversations + messages + media_refs tables
    media-refs.ts           → Media ref extraction from tool events + persistence
    migrate.ts              → Migration runner
  routes/
    chat.ts                 → POST /chat handler
    health.ts               → GET /health handler
    slack-events.ts         → POST /slack/events handler (supports X-Sync-Response header)
  slack/
    client.ts               → WebClient singleton (lazy-init from SLACK_BOT_TOKEN)
    verify.ts               → HMAC-SHA256 signature verification
    events.ts               → Event types + helpers (shouldProcess, cleanMessageText, buildExternalId)
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
drizzle/                    → Generated migration SQL
drizzle.config.ts           → Drizzle Kit config
```

## Key Patterns

- **Stateless agent**: Agent is created per-request. Previous messages are loaded from DB and restored via `agent.replaceMessages()`.
- **JSONB messages**: Full `AgentMessage` objects stored as JSONB in the `messages` table. The `role` and `sequence` columns exist for querying and ordering.
- **Interface-agnostic conversations**: The `conversations` table has an `interfaceType` field (http/slack/cli) so multiple frontends can share the same backend. Slack conversations are keyed by `externalId` = `"{channel}:{thread_ts}"`.
- **Slack immediate ack**: The `/slack/events` handler returns 200 immediately and processes the message async (fire-and-forget) to stay within Slack's 3-second timeout. Responses are always posted as thread replies.
- **Slack sync mode**: Sending `X-Sync-Response: true` header makes `/slack/events` wait for the agent and return the response in the HTTP body (used by `test-slack.ts` for dev workflow).
- **Slack dedup**: In-memory `Set<string>` on `event_id` (capped at 10k entries) + `X-Slack-Retry-Num` header skipping prevents duplicate processing.
- **Structured logging**: `createLogger(module)` from `src/logger.ts` emits JSON lines with `level`, `module`, `msg`, `timestamp` + contextual fields. Use throughout — no raw `console.log`.
- **Token optimization**: Each service has `utils.ts` with `toPartial*` helpers that strip large API responses down to essential fields before sending to the LLM.

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
BASE_URL=https://kyle.vanhattum.xyz bun run test-slack.ts "hello"
```

The test script signs requests using `SLACK_SIGNING_SECRET` from `.env`, matching Slack's signature format. Messages sent this way will trigger real agent processing and post responses to Slack. Kyle's response is returned synchronously in the terminal via `X-Sync-Response` header.

**Important**: The test payload doesn't set `channel_type`, so `shouldProcess` treats it as a channel message and requires a bot mention. Prefix messages with `<@U099N4BJT5Y>`:
```bash
BASE_URL=https://kyle.vanhattum.xyz bun run test-slack.ts "<@U099N4BJT5Y> add inception"
```

### Schema Changes

1. Edit `src/db/schema.ts`
2. `bun run db:generate` to create migration file
3. `bun run db:migrate` to apply locally
4. Commit both schema.ts and the migration

## Slack App Configuration

- **App settings**: Managed via manifest at [api.slack.com/apps](https://api.slack.com/apps)
- **Request URL**: `https://kyle.vanhattum.xyz/slack/events`
- **Bot events**: `message.im`, `message.channels`, `message.groups`, `message.mpim`, `assistant_thread_started`, `assistant_thread_context_changed`
- **Bot scopes**: `chat:write`, `app_mentions:read`, `assistant:write`, `im:history`, `im:read`, `channels:history`, `groups:history`, `mpim:history`, `users:read`, `chat:write.customize`, `incoming-webhook`
- The app uses Slack's **Assistant** feature (assistant events are subscribed but not yet handled with the `assistant.threads.*` API)

## Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | Postgres connection string (auto-injected by Railway in production) |
| `PORT` | Server port (default: 3000) |
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude |
| `SLACK_BOT_TOKEN` | Slack bot token (`xoxb-...`) |
| `SLACK_SIGNING_SECRET` | Slack app signing secret for request verification |
| `SONARR_HOST` | Sonarr instance URL |
| `SONARR_API_KEY` | Sonarr API key |
| `RADARR_HOST` | Radarr instance URL |
| `RADARR_API_KEY` | Radarr API key |
| `TMDB_API_TOKEN` | TMDB API bearer token |

## Task Tracking

We use [beads](https://github.com/steveyegge/beads) (`bd`) for task tracking — both v1 feature parity work and future enhancements.

```bash
bd ready              # Show unblocked tasks ready to work on
bd list --status=open # All open tasks
bd show <id>          # Full details + dependencies
bd update <id> --status=in_progress  # Claim a task
bd close <id>         # Mark complete
bd sync               # Sync with git after changes
```

Use `TODO(kyle-xxx)` comments in code to mark where work is needed, linking to the relevant bead. When identifying new work (bugs, enhancements, refactors), create a bead and add a TODO comment at the relevant location in code.

## v1 Reference

The v1 codebase lives on the `main` branch. To read v1 source files without switching branches: `git show main:src/lib/radarr/api.ts`. Useful when porting remaining features.

## Conventions

- **Runtime**: Bun — use `bun run`, `bun test`, `bun install`. Bun auto-loads `.env`.
- **HTTP**: `Bun.serve()` — no Express.
- **Database**: `postgres` package with Drizzle ORM — no `pg`.
- **File I/O**: Prefer `Bun.file` over `node:fs`.
- **Deployment**: `railway up`. Migrations run via pre-deploy command. Health check at `/health`. Live at https://kyle.vanhattum.xyz. Logs: `railway logs -n 80`.
- **Production DB**: The Railway DATABASE_URL uses internal networking (not reachable locally). Use `echo "SELECT ..." | railway connect Postgres` to query production.
- **Slack**: `@slack/web-api` only (no Bolt). Signature verification uses `crypto.subtle` (native in Bun).
- **Git workflow**: Commit, push, and deploy (`railway up`) after every change. Railway deploys from uploaded files, not from git, but keeping the repo in sync is essential.
- **Beads**: Close relevant beads (`bd close <id>`) when work is completed, then `bd sync` and commit the updated `.beads/` directory.
