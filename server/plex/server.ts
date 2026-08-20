import type { PlexAccount } from "./types.ts";
import { parseShareList, type PlexShareListUser } from "./users-xml.ts";
import { createApiClient } from "../http/client.ts";
import { optionalEnv, requireEnv } from "../config.ts";

/** Calls to plex.tv made as the server owner rather than as the signing-in user. */
const plexTv = createApiClient({
  service: "plex-owner",
  config: () => {
    const [clientIdentifier, token] = requireEnv("PLEX_CLIENT_IDENTIFIER", "PLEX_SERVER_TOKEN");
    return {
      baseUrl: "https://plex.tv/api",
      headers: {
        Accept: "application/json",
        "X-Plex-Product": "Kyle",
        "X-Plex-Client-Identifier": clientIdentifier,
        "X-Plex-Token": token,
      },
    };
  },
});

/** Calls to the Plex Media Server itself. */
export const pmsRequest = createApiClient({
  service: "plex-pms",
  config: () => {
    const [url, token] = requireEnv("PLEX_SERVER_URL", "PLEX_SERVER_TOKEN");
    return {
      baseUrl: url.replace(/\/$/, ""),
      headers: { Accept: "application/json", "X-Plex-Token": token },
    };
  },
});

/** Reading the Plex server is optional; without it Kyle falls back to linked accounts only. */
export function isPlexServerConfigured(): boolean {
  return (
    optionalEnv("PLEX_SERVER_URL") !== undefined && optionalEnv("PLEX_SERVER_TOKEN") !== undefined
  );
}

/** Everyone the owner's servers are shared with, across all of their servers. */
export async function getShareList(): Promise<PlexShareListUser[]> {
  return parseShareList(await plexTv<string>("/users"));
}

/** The account the server token belongs to. */
export async function getOwnerAccount(): Promise<PlexAccount> {
  return plexTv<PlexAccount>("/v2/user");
}

interface IdentityResponse {
  MediaContainer: { machineIdentifier: string };
}

/** Identifies which of the owner's servers Kyle is configured against. */
export async function getMachineIdentifier(): Promise<string> {
  const identity = await pmsRequest<IdentityResponse>("/identity");
  return identity.MediaContainer.machineIdentifier;
}
