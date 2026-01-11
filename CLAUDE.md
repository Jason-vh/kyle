# Kyle v2

AI-powered media library assistant built with Bun, deployed on Railway.

## Stack

- **Runtime**: Bun
- **Database**: PostgreSQL with Drizzle ORM
- **Deployment**: Railway (Railpack builder)
- **AI**: Vercel AI SDK with Anthropic Claude

## Development

```bash
bun run db:up        # Start local Postgres (Docker)
bun run dev          # Run with hot reload (needs DATABASE_URL)
bun run db:generate  # Generate migrations after schema changes
bun run db:push      # Push schema to DB (dev only)
```

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
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs` readFile/writeFile

## Database

Schema defined in `src/db/schema.ts`:
- `conversations` - Chat sessions (interface-agnostic)
- `tool_calls` - AI tool invocation logs
- `media_refs` - Media ID cross-references for notifications

Migrations are in `drizzle/` and run automatically on deploy via Railway's pre-deploy command.

## Deployment

Deploy with `railway up`. Configuration in `railway.json`:
- Uses Railpack builder for Bun support
- Pre-deploy command runs migrations
- Health check at `/health`
