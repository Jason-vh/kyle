# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Kyle - Media Management Bot (Slack)

## Overview
Kyle is a serverless AI-powered bot for Slack that helps manage media libraries through Radarr, Sonarr, and Ultra services. It uses OpenAI models to understand natural language requests and execute actions on your media services through a tools-based architecture.

## Tech Stack
- **Runtime**: Cloudflare Workers (edge serverless)
- **Language**: TypeScript
- **AI**: OpenAI GPT models via AI SDK
- **Bot Framework**: Custom Slack client (no Bolt dependency)
- **HTTP Framework**: Hono (lightweight web framework)
- **Package Manager**: npm
- **Deployment**: Wrangler (Cloudflare Workers CLI)

## Architecture
- **Serverless**: Runs on Cloudflare Workers edge network
- **Webhook-based**: Slack sends updates via webhooks (no polling)
- **Stateless**: Each request is independent, context built from Slack conversation history
- **AI-powered**: OpenAI processes natural language and decides which tools to use

## Development Commands

### Local Development
```bash
# Install dependencies
npm install

# Set up secrets for local dev (copy from .dev.vars.example)
cp .dev.vars.example .dev.vars
# Edit .dev.vars with your actual credentials

# Start local dev server (with tunnel for webhooks)
npm run dev
```

### Deployment
```bash
# Generate TypeScript types for Cloudflare bindings
npm run cf-typegen

# Deploy to Cloudflare Workers
npm run deploy
```

### Environment Setup
Set secrets in Cloudflare for production:
```bash
wrangler secret put OPENAI_API_KEY
wrangler secret put SLACK_BOT_TOKEN
wrangler secret put SLACK_SIGNING_SECRET
wrangler secret put RADARR_API_KEY
wrangler secret put SONARR_API_KEY
wrangler secret put ULTRA_API_TOKEN
```

Environment variables (in `wrangler.toml`):
- `RADARR_HOST` - Radarr server URL
- `SONARR_HOST` - Sonarr server URL
- `ULTRA_HOST` - Ultra server URL

## Project Structure
```
/src
  /index.ts           - Main entry point, webhook handler
  /lib
    /ai
      /agent.ts       - OpenAI integration with tools
      /prompt.ts      - System prompt for AI
      /constants.ts   - AI configuration constants
      /utils.ts       - AI utility functions
    /slack
      /client.ts      - Slack API client
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

## Development Notes

### Adding New Services
1. Create a new folder under `/src/lib/` with the standard pattern:
   - `api.ts` - API client implementation
   - `tools.ts` - AI tool definitions
   - `types.ts` - TypeScript interfaces
2. Import tools in `/src/lib/ai/agent.ts`
3. Add environment variables to type definitions and `wrangler.toml`

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
- Auto-generated types from Wrangler for Cloudflare bindings
- Zod schemas for AI tool parameter validation
- Comprehensive interfaces for all service APIs

### Logging
Uses a simple namespaced logger:
```typescript
const logger = createLogger('namespace');
logger.log('message', { contextData });
logger.error('error', { errorData });
```

## Important Limitations
- **Stateless**: Bot doesn't remember conversation history beyond what's fetched from Slack
- **Timeout**: Cloudflare Workers have a 30-second timeout for webhook responses
- **Bundle size**: Must be under 10MB compressed
- **Slack API**: Limited to Bot API features (can't access full workspace chat history)

## Troubleshooting

### Bot not responding
1. Check webhook endpoint in Slack app settings points to your Worker
2. Check logs: `wrangler tail`
3. Verify secrets are set: `wrangler secret list`
4. Test health endpoint: `curl https://your-worker.workers.dev/health`

### API connection issues
1. Verify API keys are correct and have proper permissions
2. Check host URLs in `wrangler.toml` are accessible
3. Ensure services are reachable from Cloudflare's network

### Development setup issues
1. Ensure `.dev.vars` has all required secrets
2. Check that `npm run dev` shows a tunnel URL for webhooks
3. Update Slack app webhook URL if tunnel URL changes

## Security Considerations
- All sensitive keys stored as encrypted Cloudflare Workers secrets
- Slack webhook signature verification should be implemented for production
- No data persistence - stateless operation reduces attack surface
- Runs in Cloudflare's isolated V8 environment