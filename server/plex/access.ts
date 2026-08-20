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
  /** Managed Home users have no Plex account of their own to sign in with. */
  canSignIn: boolean;
}

interface ServerAccess {
  ownerAccountId: string;
  ownerName: string;
  members: Map<string, Member>;
}

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
      canSignIn: user.username !== "",
    });
  }

  const value: ServerAccess = {
    ownerAccountId: String(owner.id),
    ownerName: owner.title || owner.username,
    members,
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
