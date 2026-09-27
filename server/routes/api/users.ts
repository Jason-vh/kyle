import { requireAdmin } from "#server/auth/middleware.ts";
import { isText, isUuid, readJsonObject } from "#server/http/input.ts";
import {
  getAllUsersWithIdentities,
  createPlatformLink,
  deletePlatformLink,
  renameUser,
} from "#server/db/users.ts";
import {
  deleteEmptyUser,
  emptyFootprint,
  footprints,
  MergeRefusedError,
  mergeUsers,
} from "#server/db/merge.ts";
import type { AdminUser } from "#shared/types.ts";
import { getPlexAvatars } from "#server/plex/access.ts";
import { createLogger } from "#server/logger.ts";

const log = createLogger("api-users");

// ---------------------------------------------------------------------------
// GET /api/users — list users with platform identities (admin only)
// ---------------------------------------------------------------------------

export async function handleGetUsers(req: Request): Promise<Response> {
  const authResult = await requireAdmin(req);
  if ("error" in authResult) return authResult.error;

  const [usersWithLinks, owned, avatars] = await Promise.all([
    getAllUsersWithIdentities(),
    footprints(),
    getPlexAvatars(),
  ]);

  const people = usersWithLinks.map(
    (u): AdminUser => ({
      id: u.id,
      displayName: u.displayName,
      avatarUrl: avatarOf(u.platformIdentities, avatars),
      isAdmin: u.isAdmin,
      createdAt: u.createdAt.toISOString(),
      identities: u.platformIdentities.map((pi) => ({
        id: pi.id,
        platform: pi.platform,
        platformUserId: pi.platformUserId,
        platformUsername: pi.platformUsername,
      })),
      footprint: owned.get(u.id) ?? emptyFootprint(),
    }),
  );

  return Response.json({ users: people });
}

function avatarOf(
  identities: { platform: string; platformUserId: string }[],
  avatars: Map<string, string>,
): string | undefined {
  const plex = identities.find((identity) => identity.platform === "plex");
  return plex ? avatars.get(plex.platformUserId) : undefined;
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

  if (!["slack", "discord"].includes(body.platform)) {
    return Response.json({ error: "platform must be 'slack' or 'discord'" }, { status: 400 });
  }

  try {
    const { link, counts } = await createPlatformLink(
      userId,
      body.platform,
      body.platformUserId,
      body.platformUsername,
    );

    log.info("platform link created", {
      userId,
      platform: body.platform,
      platformUserId: body.platformUserId,
      backfill: counts,
    });

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
