import type { PlexAccount } from "./types.ts";
import { parseSentInvites, type PlexSentInvite } from "./invites-xml.ts";
import { parseLibrarySectionIds } from "./sections-xml.ts";
import { parseShareList, type PlexShareListUser } from "./users-xml.ts";
import { createApiClient } from "#server/http/client.ts";
import { optionalEnv, requireEnv } from "#server/config.ts";

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

/** Invitations the owner has sent that are still outstanding. */
export async function getSentInvites(): Promise<PlexSentInvite[]> {
  return parseSentInvites(await plexTv<string>("/invites/requested"));
}

/** The ids plex.tv knows a server's libraries by, which sharing is expressed in. */
export async function getLibrarySectionIds(machineIdentifier: string): Promise<number[]> {
  return parseLibrarySectionIds(
    await plexTv<string>(`/servers/${machineIdentifier}`),
    machineIdentifier,
  );
}

/** What an invited person may do besides watch. Plex reads these as flags. */
const SHARE_SETTINGS = {
  allowSync: "1",
  allowCameraUpload: "0",
  allowChannels: "0",
  allowSubtitleAdmin: "0",
};

/**
 * Invites an email address onto the server.
 *
 * The v2 endpoint is the one Plex's own web app uses, and it answers a refusal
 * in words worth showing to whoever typed the address.
 */
export async function createShare(
  machineIdentifier: string,
  invitedEmail: string,
  librarySectionIds: number[],
): Promise<void> {
  await plexTv("/v2/shared_servers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      machineIdentifier,
      invitedEmail,
      librarySectionIds,
      settings: SHARE_SETTINGS,
    }),
  });
}

/** Ends a share, whether it was taken up or is still an outstanding invitation. */
export async function deleteShare(machineIdentifier: string, shareId: string): Promise<void> {
  await plexTv(`/servers/${machineIdentifier}/shared_servers/${shareId}`, { method: "DELETE" });
}

/**
 * Withdraws an invitation plex.tv holds no share against.
 *
 * An invitation to someone with no Plex account is identified by the address
 * it was sent to, which has to survive being put in a path.
 */
export async function deleteSentInvite(inviteId: string): Promise<void> {
  const id = encodeURIComponent(inviteId);
  await plexTv(`/invites/requested/${id}?friend=0&home=0&server=1`, { method: "DELETE" });
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
