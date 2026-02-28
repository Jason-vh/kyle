# Kyle

AI-powered Plex media library assistant. Natural language interface for managing Radarr, Sonarr, and related services.

Built with [pi-agent-core](https://github.com/badlogic/pi-mono) + Anthropic Claude, running on Bun.

## Quick Start

```bash
bun install
cp .env.example .env       # Add your API keys
bun run db:up              # Start Postgres
bun run db:migrate         # Run migrations
bun run dev                # Start server with hot reload
```

Then talk to Kyle:

```bash
bun run cli
```

Or via HTTP:

```bash
curl -X POST http://localhost:3000/chat \
  -H 'Content-Type: application/json' \
  -d '{"message": "Hey Kyle, what can you help me with?"}'
```

## Integrations

### Sonarr

Kyle can query your Sonarr library to tell you what TV series you have. Set `SONARR_HOST` and `SONARR_API_KEY` in your `.env`.

## Thread Viewer

Kyle includes a web-based thread viewer for browsing past Slack conversations at `/threads/:thread_ts`. Protected by a shared token (`THREAD_VIEWER_TOKEN` env var) with cookie-based auth.

Features:

- Server-rendered HTML with dark theme
- Tool calls paired with their results in collapsible sections
- Error states shown with full error details
- Slack usernames resolved via the Slack API

Visit `https://kyle.vanhattum.xyz/threads/<thread_ts>` to view any Slack thread.

## API

| Endpoint                  | Description                       |
| ------------------------- | --------------------------------- |
| `GET /`                   | Service info                      |
| `GET /health`             | Health check (includes DB status) |
| `POST /chat`              | Send a message, get a response    |
| `GET /threads/login`      | Thread viewer login page          |
| `GET /threads/:thread_ts` | View a Slack conversation thread  |

### POST /chat

```json
// Request
{ "message": "string", "conversationId?": "uuid", "userId?": "string" }

// Response
{ "conversationId": "uuid", "response": "string" }
```

Omit `conversationId` to start a new conversation. Include it to continue an existing one.

## Database

```bash
bun run db:up        # Start local Postgres (Docker)
bun run db:down      # Stop local Postgres
bun run db:migrate   # Run migrations
bun run db:generate  # Generate migration from schema changes
bun run db:studio    # Open Drizzle Studio GUI
```

## Deployment

Deployed on [Railway](https://railway.com). Migrations run automatically before each deploy.

```bash
railway up
```
