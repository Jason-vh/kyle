import { invalidatePlexAccessCache } from "./access.ts";
import {
  createShare,
  deleteSentInvite,
  deleteShare,
  getLibrarySectionIds,
  getMachineIdentifier,
  getOwnerAccount,
  getSentInvites,
  getShareList,
} from "./server.ts";
import { shareOn } from "./users-xml.ts";
import { ApiError } from "#server/http/client.ts";
import { createLogger } from "#server/logger.ts";

const log = createLogger("plex-members");

export type PlexMemberStatus = "owner" | "member" | "pending";

export interface PlexMember {
  /** Addresses what the member stands on: a share, or an invitation. */
  handle: string;
  name: string;
  email: string;
  thumb: string;
  status: PlexMemberStatus;
}

/** Something plex.tv refused, in words worth showing to whoever caused it. */
export class PlexRefusedError extends Error {
  override readonly name = "PlexRefusedError";
}

const OWNER_HANDLE = "owner";

/**
 * A refusal rather than a failure: plex.tv rejects a bad address, an address
 * already on the server, and the owner's own address in the same shape, each
 * with a sentence that says which.
 */
function asRefusal(error: unknown): PlexRefusedError | undefined {
  if (!(error instanceof ApiError) || error.status >= 500) return undefined;

  const body = error.body as { errors?: { message?: unknown }[] } | null | undefined;
  const message = body?.errors?.[0]?.message;
  if (typeof message !== "string" || message === "") return undefined;

  return new PlexRefusedError(message);
}

const STATUS_ORDER: Record<PlexMemberStatus, number> = { owner: 0, member: 1, pending: 2 };

function byStandingThenName(a: PlexMember, b: PlexMember): number {
  return STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name);
}

/**
 * Everyone who can watch, and everyone who has been asked.
 *
 * An invitation shows up twice over: as a share nobody has taken up, and as an
 * outstanding invitation. Someone who has no Plex account yet only has the
 * second, so both are read and matched up by address.
 */
export async function listPlexMembers(): Promise<PlexMember[]> {
  const [owner, machineIdentifier, shareList, invites] = await Promise.all([
    getOwnerAccount(),
    getMachineIdentifier(),
    getShareList(),
    getSentInvites(),
  ]);

  const members: PlexMember[] = [
    {
      handle: OWNER_HANDLE,
      name: owner.title || owner.username,
      email: owner.email,
      thumb: owner.thumb,
      status: "owner",
    },
  ];

  for (const user of shareList) {
    const share = shareOn(user, machineIdentifier);
    if (!share) continue;
    members.push({
      handle: `share:${share.id}`,
      name: user.title || user.username || user.email,
      email: user.email,
      thumb: user.thumb,
      status: share.pending ? "pending" : "member",
    });
  }

  const accounted = new Set(members.map((member) => member.email.toLowerCase()));
  for (const invite of invites) {
    if (accounted.has(invite.email.toLowerCase())) continue;
    members.push({
      handle: `invite:${invite.id}`,
      name: invite.friendlyName || invite.username || invite.email,
      email: invite.email,
      thumb: invite.thumb,
      status: "pending",
    });
  }

  return members.sort(byStandingThenName);
}

/** Invites an address onto the server, with every library shared. */
export async function invitePlexMember(email: string): Promise<void> {
  const machineIdentifier = await getMachineIdentifier();
  const librarySectionIds = await getLibrarySectionIds(machineIdentifier);

  try {
    await createShare(machineIdentifier, email, librarySectionIds);
  } catch (error) {
    const refusal = asRefusal(error);
    if (refusal) throw refusal;
    throw error;
  }

  invalidatePlexAccessCache();
  log.info("invited someone to the plex server", { libraries: librarySectionIds.length });
}

/** Takes back a share or an invitation, whichever the member stands on. */
export async function removePlexMember(member: PlexMember): Promise<void> {
  const [kind, id] = member.handle.split(":");
  if (kind === "share" && id) {
    await deleteShare(await getMachineIdentifier(), id);
  } else if (kind === "invite" && id) {
    await deleteSentInvite(id);
  } else {
    throw new PlexRefusedError("That person cannot be removed.");
  }

  invalidatePlexAccessCache();
  log.info("removed someone from the plex server", { status: member.status });
}
