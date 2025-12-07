# Kyle - Media Management Bot

An AI-powered Slack bot for managing your media library through Radarr, Sonarr, and other media services. Built with Bun and the AI SDK.

## Features

- Natural language media management via OpenAI GPT models
- Radarr integration for movie management
- Sonarr integration for TV show management
- qBittorrent integration for download management
- TMDB integration for media metadata
- Conversation memory - remembers tool calls within a thread
- **Media availability notifications** - Kyle notifies you when requested media finishes downloading
- Self-hosted on your media server

## Prerequisites

- [Bun](https://bun.sh) runtime
- OpenAI API key
- Slack App credentials
- Radarr/Sonarr instances

## Local Development

1. Install dependencies:

```bash
bun install
```

2. Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

3. Initialize the database:

```bash
bun run db:push
```

4. Run the development server:

```bash
bun run dev
```

## Available Commands

- `bun run dev` - Start local development server with hot reload
- `bun run build` - Build for production
- `bun run deploy` - Build and restart PM2 process
- `bun run db:push` - Push schema changes to SQLite database
- `bun run db:studio` - Open Drizzle Studio to inspect database
- `bun run pm2:start` - Start with PM2 (first time)
- `bun run pm2:restart` - Restart PM2 process
- `bun run pm2:logs` - View PM2 logs

## Database

Kyle uses SQLite (via Drizzle ORM) to persist conversation context:

- **Tool call history**: Remembers what tools were called in each thread
- **Media references**: Indexes by TMDB/TVDB/Radarr/Sonarr IDs for future cross-thread lookups

Data is stored in `./data/kyle.db` (gitignored).
