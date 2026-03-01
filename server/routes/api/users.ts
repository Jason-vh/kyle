import { requireAdmin } from "../../auth/middleware.ts";
import {
  getAllUsersWithIdentities,
  createPlatformLink,
  deletePlatformLink,
} from "../../db/users.ts";
import { createLogger } from "../../logger.ts";

const log = createLogger("api-users");

// ---------------------------------------------------------------------------
// GET /api/users — list users with platform identities (admin only)
// ---------------------------------------------------------------------------

export async function handleGetUsers(req: Request): Promise<Response> {
  const authResult = await requireAdmin(req);
  if ("error" in authResult) return authResult.error;

  const usersWithLinks = await getAllUsersWithIdentities();

  return Response.json(
    usersWithLinks.map((u) => ({
      id: u.id,
      displayName: u.displayName,
      isAdmin: u.isAdmin,
      createdAt: u.createdAt.toISOString(),
      platformIdentities: u.platformIdentities.map((pi) => ({
        id: pi.id,
        platform: pi.platform,
        platformUserId: pi.platformUserId,
        platformUsername: pi.platformUsername,
        linkedAt: pi.linkedAt.toISOString(),
      })),
    })),
  );
}

// ---------------------------------------------------------------------------
// POST /api/users/:id/links — add platform link (admin only)
// ---------------------------------------------------------------------------

export async function handleCreateLink(req: Request, userId: string): Promise<Response> {
  const authResult = await requireAdmin(req);
  if ("error" in authResult) return authResult.error;

  let body: { platform?: string; platformUserId?: string; platformUsername?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.platform || !body.platformUserId) {
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
  _userId: string,
  linkId: string,
): Promise<Response> {
  const authResult = await requireAdmin(req);
  if ("error" in authResult) return authResult.error;

  const deleted = await deletePlatformLink(linkId);
  if (!deleted) {
    return Response.json({ error: "Link not found" }, { status: 404 });
  }

  log.info("platform link deleted", { linkId, platform: deleted.platform });
  return Response.json({ success: true });
}
