# Plex Authentication Implementation Guide

## Overview
This document describes how to implement Plex authentication for the Kyle bot, following the existing service patterns used for Radarr, Sonarr, and other integrations.

## Authentication Method

Use **Traditional Token Authentication** (not JWT). This is simpler and suitable for server-to-server communication.

### Why Traditional Token Authentication?
- Simpler to implement and maintain
- Similar to existing services (API key-based)
- Better suited for server-to-server communication
- JWT is more appropriate for user-facing OAuth flows

## Token Generation Process

### Step 1: Generate a 4-digit PIN
```bash
curl -X POST "https://plex.tv/api/v2/pins?strong=false" \
  -H "Content-Type: application/json" \
  -H "X-Plex-Product: Kyle Bot" \
  -H "X-Plex-Version: 1.0" \
  -H "X-Plex-Client-Identifier: $(uuidgen)"
```

Response includes:
- `code`: 4-digit PIN (e.g., "QHX6")
- `id`: PIN ID for polling
- `clientIdentifier`: UUID to use in subsequent requests

### Step 2: User Authorization
1. User visits: https://plex.tv/link
2. Enters the 4-digit PIN code
3. Authorizes "Kyle Bot"

### Step 3: Retrieve Token
```bash
curl "https://plex.tv/api/v2/pins/{PIN_ID}" \
  -H "X-Plex-Client-Identifier: {CLIENT_IDENTIFIER}"
```

The `authToken` field in the response is your Plex token.

## Token Usage

### Important: Single Token for Both Services
The token obtained from plex.tv works for **both**:
- **plex.tv API**: Account-level operations, server discovery
- **Plex Media Server (PMS)**: Direct server operations

No separate PMS token is needed in modern Plex setups.

### Discover Available Servers
```bash
curl "https://plex.tv/api/v2/resources?X-Plex-Token={TOKEN}" \
  -H "X-Plex-Client-Identifier: {CLIENT_IDENTIFIER}"
```

Returns list of available servers with:
- Server name, address, port
- Connection details (local/remote)
- `accessToken`: Same as plex.tv token

### Access PMS Directly
```bash
curl "http://{SERVER_IP}:{PORT}/?X-Plex-Token={TOKEN}" \
  -H "X-Plex-Client-Identifier: {CLIENT_IDENTIFIER}"
```

## Implementation Pattern

Follow the existing service architecture:

### 1. Environment Variables
Add to `.env` and `.env.example`:
```bash
PLEX_HOST=http://your-plex-server.com:32400
PLEX_TOKEN=your-token-here
```

### 2. File Structure
```
src/lib/plex/
  ├── api.ts      - API client with authentication
  ├── tools.ts    - AI tools for Plex operations
  └── types.ts    - TypeScript interfaces
```

### 3. API Client Pattern (`api.ts`)
```typescript
async function makeRequest(endpoint: string, options: RequestInit = {}) {
  if (!Bun.env.PLEX_TOKEN) {
    throw new Error("PLEX_TOKEN is not set");
  }

  if (!Bun.env.PLEX_HOST) {
    throw new Error("PLEX_HOST is not set");
  }

  const url = `${Bun.env.PLEX_HOST}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      "X-Plex-Token": Bun.env.PLEX_TOKEN,
      "X-Plex-Client-Identifier": "04345078-0AB7-4A29-A90D-DFE4FC84CD67", // Store as constant
      "Accept": "application/json",
      ...options.headers,
    },
  });

  // Handle response...
}
```

## Key Differences from Radarr/Sonarr

1. **Header Name**: Use `X-Plex-Token` (not `X-Api-Key`)
2. **Client Identifier**: Must include `X-Plex-Client-Identifier` header in all requests
3. **Response Format**: Plex returns XML by default; use `Accept: application/json` header
4. **Token in URL**: Can pass token as query param: `?X-Plex-Token={TOKEN}` (alternative to header)

## Common API Endpoints

- `/library/sections` - List libraries
- `/status/sessions` - Current playback sessions
- `/library/recentlyAdded` - Recently added content
- `/search?query={term}` - Search across libraries
- `/library/sections/{id}/all` - Content in specific library

## Security Considerations

- Store token securely in `.env` (never commit)
- Token has full account access - treat like a password
- Tokens don't expire unless manually revoked
- Can generate new tokens anytime from Plex account settings

## References

- [Plex API Documentation](https://developer.plex.tv/pms/)
- Existing service implementations: `src/lib/radarr/api.ts`, `src/lib/sonarr/api.ts`