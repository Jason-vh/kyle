# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Kyle - Media Management Bot (Slack)

## Overview

Kyle is an AI-powered bot for Slack that helps manage media libraries through Radarr, Sonarr, and Ultra services. It uses OpenAI models to understand natural language requests and execute actions on your media services through a tools-based architecture.

## Tech Stack

- **Runtime**: Bun (JavaScript runtime)
- **Language**: TypeScript
- **AI**: OpenAI GPT models via AI SDK
- **Bot Framework**: Custom Slack client (no Bolt dependency)
- **Package Manager**: npm/bun
- **Process Manager**: PM2
- **Deployment**: Self-hosted on media server

## Architecture

- **Self-hosted**: Runs on your media server with PM2 process management
- **Webhook-based**: Slack sends updates via webhooks (no polling)
- **Conversation memory**: Tool calls are persisted to SQLite, injected as context on subsequent messages
- **AI-powered**: OpenAI processes natural language and decides which tools to use

## Development Commands

### Local Development

```bash
# Install dependencies
bun install
# or: npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your actual credentials

# Start local dev server (with hot reload)
bun run dev
# or: npm run dev
```

### Production Deployment

```bash
# Build the application
bun run build

# Start with PM2 (first time)
bun run pm2:start

# Restart after changes
bun run deploy
# or: bun run pm2:restart

# Monitor logs
bun run pm2:logs

# Check status
bun run pm2:status
```

### Database Commands

```bash
# Push schema changes to SQLite (creates tables if needed)
bun run db:push

# Open Drizzle Studio to inspect data
bun run db:studio

# Generate migrations (if using migration workflow)
bun run db:generate

# Run migrations
bun run db:migrate
```

### Environment Setup

Set environment variables in `.env` file:

```bash
# Copy the example file
cp .env.example .env

# Edit .env with your actual values:
OPENAI_API_KEY=your_openai_api_key_here
SLACK_BOT_TOKEN=xoxb-your-slack-bot-token-here
SLACK_SIGNING_SECRET=your_slack_signing_secret_here
RADARR_API_KEY=your_radarr_api_key_here
SONARR_API_KEY=your_sonarr_api_key_here
ULTRA_API_TOKEN=your_ultra_api_token_here

# Service endpoints (update with your URLs)
RADARR_HOST=https://your-server.com/radarr
SONARR_HOST=https://your-server.com/sonarr
ULTRA_HOST=https://your-server.com/ultra-api

# Server settings
PORT=3000
NODE_ENV=production
```

## Project Structure

```
/src
  /index.ts           - Main entry point, webhook handler
  /lib
    /ai
      /agent.ts       - OpenAI integration with tools
      /prompt.ts      - System prompt for AI
      /constants.ts   - AI configuration constants
    /db
      /index.ts       - Database connection (bun:sqlite + Drizzle)
      /schema.ts      - Database schema (conversations, tool_calls, media_refs)
      /repository.ts  - Save/query functions for tool call persistence
      /extractor.ts   - Extract media IDs from tool results
    /slack
      /api.ts         - Slack API client
      /handler.ts     - Slack event processing
      /types.ts       - Slack API types
      /utils.ts       - Slack utilities (username resolution, thread handling)
    /radarr
      /api.ts         - Radarr API client
      /tools.ts       - AI tools for Radarr
      /types.ts       - TypeScript types
    /sonarr
      /api.ts         - Sonarr API client
      /tools.ts       - AI tools for Sonarr
      /types.ts       - TypeScript types
    /ultra
      /api.ts         - Ultra API client
      /tools.ts       - AI tools for Ultra
      /types.ts       - TypeScript types
    /logger.ts        - Logging utility
  /types
    /index.ts         - Shared TypeScript types
/data
  /kyle.db            - SQLite database (gitignored)
```

## Key Architectural Patterns

### AI Tools Pattern

Each service exposes "tools" that the AI can use:

```typescript
export function getServiceTools(env: Env) {
	return {
		searchService: tool({
			description: "Search for items",
			inputSchema: z.object({
				query: z.string(),
			}),
			execute: async ({ query }) => {
				// Implementation with error handling
			},
		}),
	};
}
```

### Error Handling

- All API errors are caught and returned as readable JSON strings to the AI
- The `createLogger` utility provides namespaced logging
- Bot always responds to user, even on errors

### Slack Integration Patterns

- **Thread-aware messaging**: Responds in threads when Kyle was mentioned in parent or has participated
- **Status updates**: Shows "is cooking..." style indicators during long operations
- **Username resolution**: Converts user IDs to friendly display names in conversation context
- **Event filtering**: Only processes messages that mention the bot or are in relevant threads

### Service API Pattern

Each service follows consistent patterns:

- `api.ts` - HTTP client with authentication and error handling
- `tools.ts` - AI tool definitions with Zod schemas
- `types.ts` - TypeScript interfaces for API responses
- Modular design allows easy addition of new services

### Conversation Persistence

Tool calls are persisted to SQLite for in-thread context:

1. **On each request**: Previous tool calls for the thread are fetched and injected as a system message
2. **After streaming**: Tool calls from `response.steps` are saved to the database
3. **Media indexing**: Tool results are parsed to extract media IDs (TMDB, TVDB, Radarr, Sonarr) for future cross-thread lookups

```typescript
// Context injected to AI looks like:
[Previous tool calls in this conversation]
- addMovie({"tmdbId":27205,"title":"Inception"}) -> {"id":123,"title":"Inception"}
- getQueue({}) -> [{"id":1,"status":"downloading"}, ... (3 items)]
```

This allows Kyle to reference previous actions without re-querying APIs (e.g., "what quality profile is it using?" after adding a movie).

## Development Notes

### Adding New Services

1. Create a new folder under `/src/lib/` with the standard pattern:
   - `api.ts` - API client implementation
   - `tools.ts` - AI tool definitions
   - `types.ts` - TypeScript interfaces
2. Import tools in `/src/lib/ai/agent.ts`
3. Add environment variables to type definitions and `.env`

### AI Integration

- Uses OpenAI GPT models through AI SDK
- **Tool execution limit**: MAX_TOOL_CALLS = 10 per conversation
- **Context building**: Fetches Slack conversation history for AI context
- **Progressive updates**: Real-time status messages during tool execution

### Slack Event Handling

Kyle processes these Slack events:

- `message` - Direct messages and channel messages that mention the bot
- `app_mention` - When someone mentions the bot with @kyle
- Thread replies where Kyle has participated or was mentioned in the parent

### Type Safety

- Strict TypeScript configuration with path mapping (`@/*`)
- Environment variable types defined in `src/types/env.ts`
- Zod schemas for AI tool parameter validation
- Comprehensive interfaces for all service APIs

### Logging

Uses a simple namespaced logger:

```typescript
const logger = createLogger("namespace");
logger.log("message", { contextData });
logger.error("error", { errorData });
```

## Important Limitations

- **In-thread memory only**: Tool call history is persisted per-thread, not across threads (cross-thread context is planned)
- **Server dependency**: Requires your media server to be running and accessible
- **Network access**: Bot must be reachable from Slack (requires public IP or tunneling)
- **Slack API**: Limited to Bot API features (can't access full workspace chat history)

## Troubleshooting

### Bot not responding

1. Check webhook endpoint in Slack app settings points to your server
2. Check PM2 logs: `bun run pm2:logs` or `pm2 logs kyle`
3. Verify environment variables are set in `.env`
4. Test health endpoint: `curl http://your-server:3000/health`
5. Check if process is running: `bun run pm2:status`

### API connection issues

1. Verify API keys are correct and have proper permissions
2. Check host URLs in `.env` are accessible from your server
3. Ensure your server can reach your media services (Radarr, Sonarr, Ultra)

### Development setup issues

1. Ensure `.env` has all required environment variables
2. Check that Bun is installed: `bun --version`
3. For webhook testing, use ngrok or similar tunneling service
4. Update Slack app webhook URL if your server URL changes

### PM2 Process Issues

1. Check if PM2 is installed: `pm2 --version`
2. View detailed logs: `pm2 logs kyle --lines 100`
3. Restart if needed: `pm2 restart kyle`
4. Check memory usage: `pm2 monit`

## Security Considerations

- All sensitive keys stored in `.env` file (keep secure, don't commit)
- Slack webhook signature verification should be implemented for production
- No data persistence - stateless operation reduces attack surface
- Consider firewall rules to limit access to webhook endpoint
- Run with non-root user in production
