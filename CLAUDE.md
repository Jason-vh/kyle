# Kyle v2

AI-powered media library assistant built with Bun, deployed on Railway.

## Stack

- **Runtime**: Bun
- **Database**: PostgreSQL with Drizzle ORM
- **AI**: pi-agent-core with Anthropic Claude
- **Deployment**: Railway (Railpack builder)

## Development

```bash
bun run db:up        # Start Postgres (Docker)
bun run db:migrate   # Run migrations
bun run dev          # Run with hot reload

bun run db:down      # Stop Postgres
bun run db:studio    # Open Drizzle Studio GUI
```

### Schema Changes

1. Edit `src/db/schema.ts`
2. `bun run db:generate` to create migration file
3. `bun run db:migrate` to apply locally
4. Commit both schema.ts and the migration

## Bun Guidelines

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun install` instead of `npm install`
- Use `bun run <script>` instead of `npm run <script>`
- Bun automatically loads .env, so don't use dotenv

### APIs

- `Bun.serve()` for HTTP server. Don't use `express`.
- `postgres` package with Drizzle for Postgres. Don't use `pg`.
- Prefer `Bun.file` over `node:fs` readFile/writeFile

## Architecture

```
index.ts                    → entry point (Bun.serve)
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

## Database

Schema defined in `src/db/schema.ts`:
- `conversations` - Chat sessions (interface-agnostic: http, slack, cli)
- `messages` - Full AgentMessage objects stored as JSONB, with role/sequence for queryability

Migrations are in `drizzle/` and run automatically on deploy via Railway's pre-deploy command.

## Deployment

Deploy with `railway up`. Configuration in `railway.json`:
- Uses Railpack builder for Bun support
- Pre-deploy command runs migrations
- Health check at `/health`
