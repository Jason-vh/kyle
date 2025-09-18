# Kyle - Media Management Bot

A multi-platform bot for Slack powered by Claude AI for managing your media library through Radarr, Sonarr, and Ultra services. Built on Cloudflare Workers.

## Features

- AI-powered natural language processing via Claude 3.5 Sonnet
- Radarr integration for movie management
- Sonarr integration for TV show management
- Ultra media service integration
- Serverless deployment on Cloudflare Workers
- Support for both Slack platforms

## Prerequisites

- Node.js 18+
- Cloudflare account
- Anthropic API Key
- Slack App credentials
- Radarr/Sonarr instances (optional)

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Copy `.dev.vars.example` to `.dev.vars` and fill in your credentials:

```bash
cp .dev.vars.example .dev.vars
```

3. Run the development server:

```bash
npm run dev
```

## Available Commands

- `npm run dev` - Start local development server
- `npm run deploy` - Deploy to Cloudflare Workers
- `npm run cf-typegen` - Generate TypeScript types for Cloudflare bindings
