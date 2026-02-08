# Kyle

AI-powered Plex media library assistant. Uses pi-agent-core with Anthropic Claude, persists conversations in Postgres via Drizzle ORM, deployed on Railway.

## Architecture

```
index.ts                    → entry point (Bun.serve)
cli.ts                      → interactive CLI client
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
drizzle/                    → Generated migration SQL
drizzle.config.ts           → Drizzle Kit config
```

## Key Patterns

- **Stateless agent**: Agent is created per-request. Previous messages are loaded from DB and restored via `agent.replaceMessages()`.
- **JSONB messages**: Full `AgentMessage` objects stored as JSONB in the `messages` table. The `role` and `sequence` columns exist for querying and ordering.
- **Interface-agnostic conversations**: The `conversations` table has an `interfaceType` field (http/slack/cli) so multiple frontends can share the same backend.

## Development

```bash
bun run db:up        # Start Postgres (Docker)
bun run db:migrate   # Run migrations
bun run dev          # Run with hot reload
bun run cli          # Interactive CLI client

bun run db:down      # Stop Postgres
bun run db:studio    # Open Drizzle Studio GUI
```

### Schema Changes

1. Edit `src/db/schema.ts`
2. `bun run db:generate` to create migration file
3. `bun run db:migrate` to apply locally
4. Commit both schema.ts and the migration

## Conventions

- **Runtime**: Bun — use `bun run`, `bun test`, `bun install`. Bun auto-loads `.env`.
- **HTTP**: `Bun.serve()` — no Express.
- **Database**: `postgres` package with Drizzle ORM — no `pg`.
- **File I/O**: Prefer `Bun.file` over `node:fs`.
- **Deployment**: `railway up`. Migrations run via pre-deploy command. Health check at `/health`.
