import type { PlexAccount, PlexPin } from "./types.ts";
import { createApiClient } from "../http/client.ts";
import { optionalEnv, requireEnv } from "../config.ts";

/** Shown in the user's Plex "Authorized Devices" view. */
const PRODUCT = "Kyle";

const AUTH_APP_URL = "https://app.plex.tv/auth#?";

const request = createApiClient({
  service: "plex",
  config: () => {
    const [clientIdentifier] = requireEnv("PLEX_CLIENT_IDENTIFIER");
    return {
      baseUrl: "https://plex.tv/api/v2",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Plex-Product": PRODUCT,
        "X-Plex-Client-Identifier": clientIdentifier,
      },
    };
  },
});

/** Plex sign-in is optional; without a client identifier its routes stay disabled. */
export function isPlexConfigured(): boolean {
  return optionalEnv("PLEX_CLIENT_IDENTIFIER") !== undefined;
}

/** `strong=true` asks for a long PIN, which also gets a longer lifetime. */
export async function createPin(): Promise<PlexPin> {
  return request<PlexPin>("/pins?strong=true", { method: "POST" });
}

export async function getPin(id: number): Promise<PlexPin> {
  return request<PlexPin>(`/pins/${id}`);
}

export async function getAccount(authToken: string): Promise<PlexAccount> {
  return request<PlexAccount>("/user", { headers: { "X-Plex-Token": authToken } });
}

/**
 * Auth App URL; Plex expects its parameters in the URL fragment.
 * Omit `forwardUrl` to poll the PIN instead of being redirected back.
 */
export function buildAuthAppUrl(code: string, forwardUrl?: string): string {
  const [clientIdentifier] = requireEnv("PLEX_CLIENT_IDENTIFIER");
  const params = new URLSearchParams({
    clientID: clientIdentifier,
    code,
    "context[device][product]": PRODUCT,
  });
  if (forwardUrl) params.set("forwardUrl", forwardUrl);
  return `${AUTH_APP_URL}${params}`;
}
