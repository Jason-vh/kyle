# Kyle v2

AI-powered media library assistant. Natural language interface for managing Radarr, Sonarr, and related services.

## Quick Start

```bash
# Install dependencies
bun install

# Start local Postgres (Docker)
bun run db:up

# Copy env template and run
cp .env.example .env
bun run dev
```

## Development

### Database

```bash
bun run db:up        # Start local Postgres (Docker)
bun run db:down      # Stop local Postgres
bun run db:generate  # Generate migrations from schema changes
bun run db:push      # Push schema directly (dev only)
bun run db:studio    # Open Drizzle Studio GUI
```

### Using Railway's Database

```bash
railway link                    # Link to Railway project
railway run bun run dev         # Run with Railway env vars
railway connect postgres        # Open psql to production DB
```

## Deployment

Deployed on [Railway](https://railway.com).

```bash
railway up           # Deploy from local
railway logs         # View production logs
railway shell        # Shell into production
```

### Pre-deploy Migrations

Migrations run automatically before each deploy via `preDeployCommand` in `railway.json`.

## Project Structure

```
src/
  index.ts           # HTTP server entrypoint
  db/
    index.ts         # Database connection
    schema.ts        # Drizzle schema (conversations, tool_calls, media_refs)
    migrate.ts       # Migration runner (pre-deploy)
drizzle/             # Generated SQL migrations
```

## Endpoints

| Path | Description |
|------|-------------|
| `GET /` | Service info |
| `GET /health` | Health check (includes DB status) |
