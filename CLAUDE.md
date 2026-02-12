# Kyle

AI-powered Plex media library assistant. Uses pi-agent-core with Anthropic Claude, persists conversations in Postgres via Drizzle ORM, deployed on Railway.

## Architecture

```
index.ts                    → entry point (Bun.serve)
cli.ts                      → interactive CLI client
test-slack.ts               → Send test messages to /slack/events
src/
  server.ts                 → HTTP routing
  agent/
    index.ts                → Agent factory + runAgent()
    system-prompt.ts        → Kyle's system prompt
  db/
    index.ts                → Drizzle + postgres connection
    schema.ts               → conversations + messages tables
    migrate.ts              → Migration runner
  routes/
    chat.ts                 → POST /chat handler
    health.ts               → GET /health handler
    slack-events.ts         → POST /slack/events handler
  slack/
    client.ts               → WebClient singleton (lazy-init from SLACK_BOT_TOKEN)
    verify.ts               → HMAC-SHA256 signature verification
    events.ts               → Event types + helpers (shouldProcess, cleanMessageText, buildExternalId)
  sonarr/
    tools.ts                → Sonarr agent tools
drizzle/                    → Generated migration SQL
drizzle.config.ts           → Drizzle Kit config
```

## Key Patterns

- **Stateless agent**: Agent is created per-request. Previous messages are loaded from DB and restored via `agent.replaceMessages()`.
- **JSONB messages**: Full `AgentMessage` objects stored as JSONB in the `messages` table. The `role` and `sequence` columns exist for querying and ordering.
- **Interface-agnostic conversations**: The `conversations` table has an `interfaceType` field (http/slack/cli) so multiple frontends can share the same backend. Slack conversations are keyed by `externalId` = `"{channel}:{thread_ts}"`.
- **Slack immediate ack**: The `/slack/events` handler returns 200 immediately and processes the message async (fire-and-forget) to stay within Slack's 3-second timeout. Responses are always posted as thread replies.
- **Slack dedup**: In-memory `Set<string>` on `event_id` (capped at 10k entries) + `X-Slack-Retry-Num` header skipping prevents duplicate processing.

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

The test script signs requests using `SLACK_SIGNING_SECRET` from `.env`, matching Slack's signature format. Messages sent this way will trigger real agent processing and post responses to Slack.

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

## Conventions

- **Runtime**: Bun — use `bun run`, `bun test`, `bun install`. Bun auto-loads `.env`.
- **HTTP**: `Bun.serve()` — no Express.
- **Database**: `postgres` package with Drizzle ORM — no `pg`.
- **File I/O**: Prefer `Bun.file` over `node:fs`.
- **Deployment**: `railway up`. Migrations run via pre-deploy command. Health check at `/health`. Live at https://kyle.vanhattum.xyz.
- **Slack**: `@slack/web-api` only (no Bolt). Signature verification uses `crypto.subtle` (native in Bun).
- **Git workflow**: Commit and push after every change. Railway deploys from uploaded files (`railway up`), not from git, but keeping the repo in sync is essential.
