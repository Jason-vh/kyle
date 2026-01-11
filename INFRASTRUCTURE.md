# Kyle v2 Infrastructure Decision

This document summarizes the research and decisions made for Kyle v2's hosting infrastructure.

## Background

Kyle v1 is deployed on an Ultra.cc machine (a seedbox primarily used for Plex/downloading). This isn't ideal for running a persistent application. We evaluated alternatives with these requirements:

### Requirements

1. **Reasonable timeout** - The AI agent loops through tool calls, which can take time. Cloudflare Workers' 30-second limit was insufficient.
2. **HTTP accessible** - Must receive webhooks from Slack and media services (Radarr/Sonarr).
3. **Easy deployment** - Prefer git-push deploys over manual SSH/PM2 management.
4. **PostgreSQL** - Prefer Postgres over SQLite for remote access via psql/pgcli.
5. **Budget** - Target of EUR 5-10/month.
6. **Future frontend** - Potential to add a basic web UI later.

---

## Decision: Railway

We chose **Railway** as the hosting platform.

### Pricing

| Component | Cost |
|-----------|------|
| Hobby Plan Subscription | $5/month |
| Included Usage Credit | $5/month |
| **Typical Total** | **$5/month** |

The $5 subscription includes $5 of usage credits. Real-world estimates for Kyle:
- Bun app (256MB RAM, always-on): ~$1.50/month
- Postgres (50MB RAM, 500MB storage): ~$0.50/month
- Egress: ~$0.10/month
- **Total usage: ~$2.10/month** (well under the $5 credit)

### Why Railway

1. **Zero-config Bun/TypeScript deploys** - Native Bun support with auto-detection. Push to GitHub, auto-deploy.
2. **One-click Postgres** - Managed Postgres included in usage credits. Connection strings auto-injected.
3. **15-minute HTTP timeout** - Sufficient for AI agent tool loops.
4. **Excellent DX** - Instant deploys, built-in logs, metrics, shell access.
5. **Simple pricing** - Flat $5/month with usage credits, no surprise bills.

### Alternatives Considered

| Option | Verdict |
|--------|---------|
| **Hetzner VPS + Neon** | Cheapest (~EUR 3.50/month), but requires VPS management (OS updates, security, PM2). More control, more work. |
| **Hetzner VPS + Supabase** | Similar to above. Supabase free tier pauses after 1 week inactivity. |
| **Render** | Free tier spins down after 15min (cold starts). Free Postgres deleted after 90 days. |
| **Fly.io** | No free tier for new users. Complex pricing model. Overkill for regional webhook receiver. |
| **Cloudflare Workers** | 30-second timeout is insufficient for AI agent loops. |

---

## Local Development Workflow

### Recommended: Connect to Railway's Remote Postgres

```
+---------------------+         +---------------------+
|   Your Machine      |         |      Railway        |
|                     |         |                     |
|  bun run dev        |--------→|  Postgres (remote)  |
|  (localhost:3000)   |   TCP   |                     |
+---------------------+         +---------------------+
```

**Setup:**

```bash
# Install Railway CLI
brew install railway
# or: npm i -g @railway/cli

# Authenticate and link project
railway login
railway link

# Run locally with Railway env vars injected
railway run bun run dev

# Or open a shell with all env vars
railway shell
bun run dev

# Access database directly
railway connect postgres   # opens psql
# or from railway shell:
psql $DATABASE_PUBLIC_URL
```

**For webhook testing locally:**
```bash
ngrok http 3000
# Update Slack webhook URL to ngrok URL temporarily
```

### Alternative: Local Postgres

If you prefer fully offline development:

```bash
# Run local Postgres
docker run -d --name kyle-postgres \
  -e POSTGRES_PASSWORD=dev \
  -e POSTGRES_DB=kyle \
  -p 5432:5432 \
  postgres:16

# Use .env.local for local development
# DATABASE_URL=postgresql://postgres:dev@localhost:5432/kyle
```

---

## Migration from Kyle v1

### Database: SQLite to Postgres

| File | Change |
|------|--------|
| `package.json` | Add `postgres` driver |
| `drizzle.config.ts` | Change dialect to `postgresql`, use `DATABASE_URL` env var |
| `src/lib/db/schema.ts` | Change `drizzle-orm/sqlite-core` to `drizzle-orm/pg-core` |
| `src/lib/db/index.ts` | Replace `bun:sqlite` with postgres driver |
| `src/lib/db/repository.ts` | Change `json_extract()` to Postgres `->>` operator |

**Schema changes:**

```typescript
// SQLite
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
integer("created_at", { mode: "timestamp" })

// Postgres
import { index, pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";
timestamp("created_at").notNull()
```

**JSON query changes:**

```typescript
// SQLite
sql`json_extract(${mediaRefs.ids}, '$.tmdbId') = ${ids.tmdbId}`

// Postgres
sql`${mediaRefs.ids}->>'tmdbId' = ${ids.tmdbId.toString()}`
```

### Deployment: PM2 to Railway

| Item | Action |
|------|--------|
| `ecosystem.config.js` | Delete - Railway manages the process |
| PM2 scripts in `package.json` | Remove - no longer needed |
| `.env.example` | Add `DATABASE_URL` |

### Data Migration

The existing SQLite database contains conversation history and media refs. Options:

1. **Start fresh** (recommended) - The data is just tool call history, not critical user data
2. **Export/Import** - Dump SQLite, convert to Postgres-compatible SQL, import

---

## Deployment Workflow

```bash
# Deploy to Railway
git push origin main
# Railway auto-builds and deploys

# View logs
railway logs

# Open shell in production
railway shell

# Connect to production database
railway connect postgres
```

---

## Environment Variables

Railway auto-injects these for the Postgres addon:
- `DATABASE_URL` - Full connection string
- `DATABASE_PUBLIC_URL` - Public connection string (for local access)
- `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` - Individual components

You'll still need to set these manually in Railway dashboard:
- `OPENAI_API_KEY`
- `SLACK_BOT_TOKEN`
- `SLACK_SIGNING_SECRET`
- `RADARR_HOST`, `RADARR_API_KEY`
- `SONARR_HOST`, `SONARR_API_KEY`
- `ULTRA_HOST`, `ULTRA_API_TOKEN`
- (and other service credentials)

---

## Architecture Diagram

```
                    +------------------+
                    |     Slack        |
                    +--------+---------+
                             |
                             | Webhooks (events, mentions)
                             v
+------------------+    +----+---------------+    +------------------+
|   Radarr/Sonarr  +--->|      Railway       |<-->|    OpenAI API    |
|   (webhooks)     |    |                    |    +------------------+
+------------------+    |  +-------------+   |
                        |  | Kyle (Bun)  |   |
                        |  +------+------+   |
                        |         |          |
                        |  +------+------+   |
                        |  |  Postgres   |   |
                        |  +-------------+   |
                        +--------------------+
```

---

## References

- [Railway Pricing](https://railway.com/pricing)
- [Railway CLI Guide](https://docs.railway.com/guides/cli)
- [Railway PostgreSQL Guide](https://docs.railway.com/guides/postgresql)
- [Deploy Bun on Railway](https://bun.sh/docs/guides/deployment/railway)
- [Drizzle ORM PostgreSQL](https://orm.drizzle.team/docs/get-started-postgresql)
