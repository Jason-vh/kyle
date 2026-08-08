# exe.dev deployment — kyle

Production is live at:

```text
https://kyle.vhtm.eu
```

Hosted on the shared `vhtm-eu` VM. The arch + conventions live in
<https://github.com/Jason-vh/vhtm.eu>. This file is just the per-app
runbook.

## Architecture

```text
client / Slack / Discord / Sonarr / Radarr webhooks
  -> https://kyle.vhtm.eu
  -> exe.dev edge (TLS termination)
  -> vhtm-eu VM :8080
  -> Caddy (host-matched via apps/kyle/deploy/caddy.snippet)
  -> 127.0.0.1:3003
  -> kyle Bun process (HTTP server + Discord bot client)
  -> shared Postgres on the apps-net Docker network (DB: kyle)
```

The Vue SPA under `web/` is built into `web/dist/` and served as
static files by the same Bun process.

## Files in this directory

| File                     | Purpose                                                                                                              |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `caddy.snippet`          | Routing for `kyle.vhtm.eu` → `127.0.0.1:3003`. Imported by `/etc/caddy/Caddyfile` via `apps/*/deploy/caddy.snippet`. |
| `env.production.example` | Shape of `.env.production` (written by CI from secrets, not committed).                                              |
| `README.md`              | This file.                                                                                                           |

## One-time exe.dev / DNS setup

```bash
# Register the hostname with the exe.dev edge:
ssh exe.dev domain add vhtm-eu kyle.vhtm.eu

# DNS at Porkbun:
#   kyle.vhtm.eu  CNAME  vhtm-eu.exe.xyz
```

## GitHub Actions secrets

Most app config is in GitHub Actions secrets, since this repo is public.

| Secret                                                              | Purpose                                                                                                                                                                       |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `KYLE_DB_PASSWORD`                                                  | Password for the `kyle` role in the shared Postgres. Created with the role (see [shared PG runbook](https://github.com/Jason-vh/vhtm.eu/blob/main/infra/postgres/README.md)). |
| `JWT_SECRET`, `CHAT_API_KEY`, `THREAD_VIEWER_TOKEN`, `WEBHOOK_AUTH` | App-level auth tokens / secrets.                                                                                                                                              |
| `ANTHROPIC_API_KEY`, `BRAVE_API_KEY`                                | LLM + search.                                                                                                                                                                 |
| `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`                           | Slack bot + event signature verification.                                                                                                                                     |
| `DISCORD_BOT_TOKEN`                                                 | Discord bot login.                                                                                                                                                            |
| `RADARR_HOST`, `RADARR_API_KEY`                                     | Radarr integration.                                                                                                                                                           |
| `SONARR_HOST`, `SONARR_API_KEY`                                     | Sonarr integration.                                                                                                                                                           |
| `TMDB_API_TOKEN`                                                    | TMDB lookups.                                                                                                                                                                 |
| `QBITTORRENT_HOST`, `QBITTORRENT_USERNAME`, `QBITTORRENT_PASSWORD`  | qBittorrent UI.                                                                                                                                                               |
| `ULTRA_HOST`, `ULTRA_API_TOKEN`                                     | Ultra integration.                                                                                                                                                            |

## Deploy

Every push to `main`:

1. Runs on the self-hosted runner labeled `kyle-prod`.
2. Writes `.env.production` from GitHub Actions secrets.
3. Copies the checkout into `/home/exedev/apps/kyle`.
4. `docker compose build` — builds the multi-stage image (web SPA + server).
5. **Migrations**: `docker compose run --rm app bun run server/db/migrate.ts`
   in a one-shot container. If migrations fail, the previous deploy keeps
   serving.
6. `docker compose up -d --remove-orphans` — starts the long-running app.
7. `caddy validate` + `systemctl reload caddy` so any change to
   `deploy/caddy.snippet` takes effect.

`WEBAUTHN_ORIGIN` and `WEBAUTHN_RP_ID` matter for passkeys. Passkeys are
origin-bound, so production sign-in/sign-up must happen on
`https://kyle.vhtm.eu`.

## Operations

```bash
ssh vhtm-eu.exe.xyz
cd /home/exedev/apps/kyle

# Container status:
docker compose ps

# App logs (server + Discord bot share stdout):
docker compose logs -f app

# Restart app:
docker compose restart app

# Run migrations manually:
docker compose run --rm app bun run server/db/migrate.ts

# Open a DB shell as the kyle role:
docker compose -f /home/exedev/infra/postgres/docker-compose.yml exec postgres \
  psql -U kyle -d kyle
```

## Health check

```bash
curl https://kyle.vhtm.eu/health
```

Returns JSON including `deployId`, the commit SHA the running container was built
from (`dev` when `DEPLOY_ID` is unset, as in local runs). Compare it against
`git rev-parse HEAD` to confirm a deploy landed.

## Database

This app has one database in the shared Postgres instance, owned by the
`kyle` role:

```text
host: postgres (over the apps-net Docker network)
db:   kyle
user: kyle
```

DB administration runbooks live with the shared instance:
<https://github.com/Jason-vh/vhtm.eu/blob/main/infra/postgres/README.md>.
