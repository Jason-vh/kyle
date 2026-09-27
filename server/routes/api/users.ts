import { requireAdmin } from "#server/auth/middleware.ts";
import { isText, isUuid, readJsonObject } from "#server/http/input.ts";
import {
  createPlatformLink,
  deletePlatformLink,
  getPlatformIdentity,
  renameUser,
} from "#server/db/users.ts";
import { withDatabaseLock } from "#server/db/lock.ts";
import { PLEX_PLATFORM } from "#server/auth/plex.ts";
import { checkPlexAccess, listPlexAccounts } from "#server/plex/access.ts";
import { isPlexServerConfigured } from "#server/plex/server.ts";
import type { LinkablePlexAccount } from "#shared/types.ts";
import { deleteEmptyUser, MergeRefusedError, mergeUsers } from "#server/db/merge.ts";
import { listAdminUsers } from "#server/users/directory.ts";
import { getUserProfile } from "#server/users/profile.ts";
import { viewerOf } from "#server/people.ts";
import { createLogger } from "#server/logger.ts";
import { errorMessage, errorResponse } from "#server/errors.ts";

const log = createLogger("api-users");

// ---------------------------------------------------------------------------
// GET /api/users — list users with platform identities (admin only)
// ---------------------------------------------------------------------------

export async function handleGetUsers(req: Request): Promise<Response> {
  const authResult = await requireAdmin(req);
  if ("error" in authResult) return authResult.error;

  const people = await listAdminUsers({ withRequestedSizes: true });

  return Response.json({ users: people });
}

// ---------------------------------------------------------------------------
// GET /api/users/plex-accounts — Plex accounts nobody has been linked to (admin only)
// ---------------------------------------------------------------------------

export async function handleGetPlexAccounts(req: Request): Promise<Response> {
  const authResult = await requireAdmin(req);
  if ("error" in authResult) return authResult.error;

  if (!isPlexServerConfigured()) {
    return Response.json({ error: "Kyle is not connected to a Plex server" }, { status: 404 });
  }

  let accounts: LinkablePlexAccount[];
  try {
    accounts = await listPlexAccounts();
  } catch (error) {
    log.error("could not list plex accounts", { error: errorMessage(error) });
    return errorResponse(error, 502, "Could not reach Plex");
  }

  const people = await listAdminUsers();
  const linked = new Set(
    people.flatMap((person) =>
      person.identities
        .filter((identity) => identity.platform === PLEX_PLATFORM)
        .map((identity) => identity.platformUserId),
    ),
  );

  const unlinked: LinkablePlexAccount[] = accounts.filter(
    (account) => !linked.has(account.accountId),
  );
  return Response.json({ accounts: unlinked });
}

// ---------------------------------------------------------------------------
// GET /api/users/:id — everything about one person (admin only)
// ---------------------------------------------------------------------------

export async function handleGetUserProfile(req: Request, userId: string): Promise<Response> {
  const authResult = await requireAdmin(req);
  if ("error" in authResult) return authResult.error;
  if (!isUuid(userId)) return Response.json({ error: "Invalid user id" }, { status: 400 });

  const profile = await getUserProfile(userId, await viewerOf(authResult.user));
  if (!profile) return Response.json({ error: "No such user" }, { status: 404 });
  return Response.json(profile);
}

// ---------------------------------------------------------------------------
// PATCH /api/users/:id — rename (admin only)
// ---------------------------------------------------------------------------

export async function handleRenameUser(req: Request, userId: string): Promise<Response> {
  const authResult = await requireAdmin(req);
  if ("error" in authResult) return authResult.error;
  if (!isUuid(userId)) return Response.json({ error: "Invalid user id" }, { status: 400 });

  let body: { displayName?: unknown };
  try {
    body = await readJsonObject(req);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!isText(body.displayName, 100)) {
    return Response.json({ error: "A name is required" }, { status: 400 });
  }

  const renamed = await renameUser(userId, body.displayName.trim());
  if (!renamed) return Response.json({ error: "No such user" }, { status: 404 });

  log.info("user renamed", { userId, by: authResult.user.id });
  return Response.json({ success: true });
}

// ---------------------------------------------------------------------------
// POST /api/users/:id/merge — fold another user into this one (admin only)
// ---------------------------------------------------------------------------

export async function handleMergeUsers(req: Request, intoId: string): Promise<Response> {
  const authResult = await requireAdmin(req);
  if ("error" in authResult) return authResult.error;

  let body: { from?: unknown };
  try {
    body = await readJsonObject(req);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!isUuid(intoId) || !isUuid(body.from)) {
    return Response.json({ error: "Invalid user id" }, { status: 400 });
  }
  try {
    await mergeUsers(body.from, intoId);
  } catch (error) {
    if (error instanceof MergeRefusedError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }

  log.info("users merged by admin", { from: body.from, into: intoId, by: authResult.user.id });
  return Response.json({ success: true });
}

// ---------------------------------------------------------------------------
// DELETE /api/users/:id — remove a user with no history (admin only)
// ---------------------------------------------------------------------------

export async function handleDeleteUser(req: Request, userId: string): Promise<Response> {
  const authResult = await requireAdmin(req);
  if ("error" in authResult) return authResult.error;
  if (!isUuid(userId)) return Response.json({ error: "Invalid user id" }, { status: 400 });
  if (userId === authResult.user.id) {
    return Response.json({ error: "You cannot delete yourself" }, { status: 409 });
  }

  try {
    await deleteEmptyUser(userId);
  } catch (error) {
    if (error instanceof MergeRefusedError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }

  log.info("user deleted by admin", { userId, by: authResult.user.id });
  return Response.json({ success: true });
}

// ---------------------------------------------------------------------------
// POST /api/users/:id/links — add platform link (admin only)
// ---------------------------------------------------------------------------

export async function handleCreateLink(req: Request, userId: string): Promise<Response> {
  const authResult = await requireAdmin(req);
  if ("error" in authResult) return authResult.error;

  let body: { platform?: string; platformUserId?: string; platformUsername?: string };
  try {
    body = await readJsonObject(req);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isUuid(userId)) return Response.json({ error: "Invalid user id" }, { status: 400 });
  if (
    body.platformUsername !== undefined &&
    (typeof body.platformUsername !== "string" || body.platformUsername.length > 200)
  ) {
    return Response.json({ error: "Invalid platformUsername" }, { status: 400 });
  }
  if (!isText(body.platform) || !isText(body.platformUserId, 200)) {
    return Response.json({ error: "platform and platformUserId are required" }, { status: 400 });
  }

  if (!LINKABLE_BY_ADMIN.includes(body.platform)) {
    return Response.json(
      { error: "platform must be 'slack', 'discord' or 'plex'" },
      { status: 400 },
    );
  }

  const { platform, platformUserId, platformUsername } = body;
  if (platform === PLEX_PLATFORM) {
    return withDatabaseLock(`plex-account:${platformUserId}`, () =>
      withDatabaseLock(`plex-user:${userId}`, async () => {
        const refusal = await plexLinkRefusal(userId, platformUserId);
        if (refusal) return Response.json({ error: refusal }, { status: 409 });
        return linkAccount(userId, platform, platformUserId, platformUsername);
      }),
    );
  }

  return linkAccount(userId, platform, platformUserId, platformUsername);
}

const LINKABLE_BY_ADMIN = ["slack", "discord", PLEX_PLATFORM];

/** Why this Plex account cannot become this person's, if it cannot. */
async function plexLinkRefusal(userId: string, accountId: string): Promise<string | undefined> {
  if (await getPlatformIdentity(userId, PLEX_PLATFORM)) {
    return "This person already has a Plex account";
  }
  if (!(await checkPlexAccess(accountId)).allowed) {
    return "That Plex account has no access to the server";
  }
  return undefined;
}

async function linkAccount(
  userId: string,
  platform: string,
  platformUserId: string,
  platformUsername?: string,
): Promise<Response> {
  try {
    const { link, counts } = await createPlatformLink(
      userId,
      platform,
      platformUserId,
      platformUsername,
    );

    log.info("platform link created", { userId, platform, platformUserId, backfill: counts });

    return Response.json({
      id: link.id,
      platform: link.platform,
      platformUserId: link.platformUserId,
      platformUsername: link.platformUsername,
      backfill: counts,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("unique")) {
      return Response.json({ error: "This platform identity is already linked" }, { status: 409 });
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/users/:id/links/:linkId — remove platform link (admin only)
// ---------------------------------------------------------------------------

export async function handleDeleteLink(
  req: Request,
  userId: string,
  linkId: string,
): Promise<Response> {
  const authResult = await requireAdmin(req);
  if ("error" in authResult) return authResult.error;

  if (!isUuid(userId) || !isUuid(linkId)) {
    return Response.json({ error: "Invalid id" }, { status: 400 });
  }

  const deleted = await deletePlatformLink(linkId);
  if (!deleted) {
    return Response.json({ error: "Link not found" }, { status: 404 });
  }

  log.info("platform link deleted", { linkId, platform: deleted.platform });
  return Response.json({ success: true });
}
