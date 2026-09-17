import type { JwtUser } from "#server/auth/jwt.ts";
import { requireAuth, type AuthResult } from "#server/auth/middleware.ts";
import { getPlexInviters, recordPlexInvite, type PlexInviter } from "#server/db/plex-invites.ts";
import {
  invitePlexMember,
  listPlexMembers,
  PlexRefusedError,
  removePlexMember,
  type PlexMember,
} from "#server/plex/members.ts";
import { isPlexServerConfigured } from "#server/plex/server.ts";
import { createLogger } from "#server/logger.ts";
import { errorMessage, errorResponse } from "#server/errors.ts";

const log = createLogger("api-plex-members");

/**
 * How many invitations one person may have outstanding.
 *
 * Every invitation is sent in the owner's name, so this is the limit on how
 * much of the owner's good standing any one member can spend.
 */
const PENDING_PER_USER = 5;

/** Plex matches a username as readily as an address; only obvious nonsense is refused here. */
const MAX_EMAIL_LENGTH = 254;

interface MemberView {
  id: string;
  name: string;
  thumb: string;
  status: PlexMember["status"];
  /** Only for someone the viewer invited, or to an admin. */
  email?: string;
  invitedBy?: string;
  canRemove: boolean;
}

function inviterOf(member: PlexMember, inviters: Map<string, PlexInviter>) {
  return inviters.get(member.email.toLowerCase());
}

/**
 * What one viewer may see and do about one member.
 *
 * Anyone may invite, so anyone may take back what they sent; removing someone
 * who is already watching is the owner's business.
 */
function memberView(
  member: PlexMember,
  viewer: JwtUser,
  inviters: Map<string, PlexInviter>,
): MemberView {
  const inviter = inviterOf(member, inviters);
  const invitedByViewer = inviter?.userId === viewer.id;
  const isPending = member.status === "pending";

  return {
    id: member.handle,
    name: member.name,
    thumb: member.thumb,
    status: member.status,
    email: viewer.admin || invitedByViewer ? member.email : undefined,
    invitedBy: isPending ? inviter?.name : undefined,
    canRemove: member.status !== "owner" && (viewer.admin || (isPending && invitedByViewer)),
  };
}

function plexUnavailable(): Response {
  return Response.json({ error: "The Plex server is not configured" }, { status: 503 });
}

async function authorise(req: Request): Promise<AuthResult> {
  if (!isPlexServerConfigured()) return { error: plexUnavailable() };
  return requireAuth(req);
}

// ---------------------------------------------------------------------------
// GET /api/plex/members — who can watch, and who has been asked
// ---------------------------------------------------------------------------

export async function handleGetPlexMembers(req: Request): Promise<Response> {
  const auth = await authorise(req);
  if ("error" in auth) return auth.error;

  try {
    const [members, inviters] = await Promise.all([listPlexMembers(), getPlexInviters()]);
    return Response.json(
      { members: members.map((member) => memberView(member, auth.user, inviters)) },
      { headers: auth.refreshHeaders },
    );
  } catch (error) {
    log.error("could not list plex members", { error: errorMessage(error) });
    return errorResponse(error, 502, "Could not reach Plex");
  }
}

// ---------------------------------------------------------------------------
// POST /api/plex/invites — ask someone onto the server
// ---------------------------------------------------------------------------

export async function handleCreatePlexInvite(req: Request): Promise<Response> {
  const auth = await authorise(req);
  if ("error" in auth) return auth.error;

  const body = (await req.json().catch(() => ({}))) as { email?: unknown };
  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (email === "" || email.length > MAX_EMAIL_LENGTH || /\s/.test(email)) {
    return Response.json({ error: "An email address is required" }, { status: 400 });
  }

  try {
    const [members, inviters] = await Promise.all([listPlexMembers(), getPlexInviters()]);

    const outstanding = members.filter(
      (member) =>
        member.status === "pending" && inviterOf(member, inviters)?.userId === auth.user.id,
    );
    if (!auth.user.admin && outstanding.length >= PENDING_PER_USER) {
      return Response.json(
        { error: `You already have ${outstanding.length} invitations waiting to be accepted` },
        { status: 429 },
      );
    }

    await invitePlexMember(email);
    await recordPlexInvite(email.toLowerCase(), auth.user.id);

    log.info("plex invite sent", { by: auth.user.id });
    return Response.json({ invited: email }, { headers: auth.refreshHeaders });
  } catch (error) {
    if (error instanceof PlexRefusedError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    log.error("could not invite to plex", { by: auth.user.id, error: errorMessage(error) });
    return errorResponse(error, 502, "Could not reach Plex");
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/plex/members/:handle — take back a share or an invitation
// ---------------------------------------------------------------------------

export async function handleRemovePlexMember(req: Request, handle: string): Promise<Response> {
  const auth = await authorise(req);
  if ("error" in auth) return auth.error;

  try {
    const [members, inviters] = await Promise.all([listPlexMembers(), getPlexInviters()]);

    const member = members.find((candidate) => candidate.handle === handle);
    if (!member) return Response.json({ error: "Not found" }, { status: 404 });

    if (!memberView(member, auth.user, inviters).canRemove) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    await removePlexMember(member);

    log.info("plex member removed", { by: auth.user.id, status: member.status });
    return Response.json({ removed: member.handle }, { headers: auth.refreshHeaders });
  } catch (error) {
    if (error instanceof PlexRefusedError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    log.error("could not remove plex member", { by: auth.user.id, error: errorMessage(error) });
    return errorResponse(error, 502, "Could not reach Plex");
  }
}
