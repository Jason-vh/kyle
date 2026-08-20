import {
  getMachineIdentifier,
  getOwnerAccount,
  getShareList,
  isPlexServerConfigured,
} from "./server.ts";
import { createLogger } from "../logger.ts";
import { errorMessage } from "../errors.ts";

const log = createLogger("plex-access");

const CACHE_TTL_MS = 5 * 60 * 1000;

interface Member {
  displayName: string;
  thumb: string;
  /** Managed Home users have no Plex account of their own to sign in with. */
  canSignIn: boolean;
}

export interface PlexPerson {
  name: string;
  thumb?: string;
}

interface ServerAccess {
  ownerAccountId: string;
  ownerName: string;
  members: Map<string, Member>;
  /**
   * Names keyed by the account id the *server* reports, which is not the same
   * space as plex.tv's: a server files its owner under a local id of 1.
   */
  byServerAccountId: Map<string, PlexPerson>;
}

/** A Plex Media Server always refers to its owner by this local account id. */
const OWNER_SERVER_ACCOUNT_ID = "1";

let cached: { value: ServerAccess; expires: number } | null = null;

/** Who the Plex server belongs to and who it is shared with, refreshed periodically. */
async function loadAccess(): Promise<ServerAccess> {
  if (cached && cached.expires > Date.now()) return cached.value;

  const [owner, machineIdentifier, shareList] = await Promise.all([
    getOwnerAccount(),
    getMachineIdentifier(),
    getShareList(),
  ]);

  const members = new Map<string, Member>();
  for (const user of shareList) {
    if (!user.machineIdentifiers.includes(machineIdentifier)) continue;
    members.set(user.accountId, {
      displayName: user.title || user.username,
      thumb: user.thumb,
      canSignIn: user.username !== "",
    });
  }

  const ownerName = owner.title || owner.username;

  // Everyone who can appear in playback history, including managed users who
  // could never sign in to Kyle themselves.
  const byServerAccountId = new Map<string, PlexPerson>();
  for (const [accountId, member] of members) {
    byServerAccountId.set(accountId, { name: member.displayName, thumb: member.thumb });
  }
  byServerAccountId.set(OWNER_SERVER_ACCOUNT_ID, { name: ownerName, thumb: owner.thumb });

  const value: ServerAccess = {
    ownerAccountId: String(owner.id),
    ownerName,
    members,
    byServerAccountId,
  };

  cached = { value, expires: Date.now() + CACHE_TTL_MS };
  log.info("loaded plex server access", { machineIdentifier, members: members.size });
  return value;
}

export function invalidatePlexAccessCache(): void {
  cached = null;
}

export interface PlexAccess {
  allowed: boolean;
  isOwner: boolean;
  /** Name to give a newly created Kyle user. */
  displayName: string;
}

const DENIED: PlexAccess = { allowed: false, isOwner: false, displayName: "" };

/**
 * Decides whether a Plex account may sign in, based on access to the server.
 * Fails closed: if plex.tv cannot be reached, nobody new gets in.
 */
export async function checkPlexAccess(accountId: string): Promise<PlexAccess> {
  if (!isPlexServerConfigured()) return DENIED;

  let access: ServerAccess;
  try {
    access = await loadAccess();
  } catch (error) {
    log.error("could not read plex server access", { error: errorMessage(error) });
    return DENIED;
  }

  if (accountId === access.ownerAccountId) {
    return { allowed: true, isOwner: true, displayName: access.ownerName };
  }

  const member = access.members.get(accountId);
  if (!member?.canSignIn) return DENIED;

  return { allowed: true, isOwner: false, displayName: member.displayName };
}

/** Names for the account ids a Plex server reports against playback. */
export async function getServerAccountNames(): Promise<Map<string, PlexPerson>> {
  if (!isPlexServerConfigured()) return new Map();

  try {
    return (await loadAccess()).byServerAccountId;
  } catch (error) {
    log.error("could not read plex account names", { error: errorMessage(error) });
    return new Map();
  }
}
