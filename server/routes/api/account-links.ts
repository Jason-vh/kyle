import { and, eq, inArray } from "drizzle-orm";
import { requireAuth } from "#server/auth/middleware.ts";
import { isLinkablePlatform, issueLinkCode, LINKABLE_PLATFORMS } from "#server/auth/link-codes.ts";
import { db } from "#server/db/index.ts";
import { platformIdentities } from "#server/db/schema.ts";
import { isUuid } from "#server/http/input.ts";
import { optionalEnv } from "#server/config.ts";
import type { AccountLinks } from "#shared/types.ts";
import { createLogger } from "#server/logger.ts";

const log = createLogger("api-account-links");

const TOKENS = { slack: "SLACK_BOT_TOKEN", discord: "DISCORD_BOT_TOKEN" } as const;

function configuredPlatforms() {
  return LINKABLE_PLATFORMS.filter((platform) => optionalEnv(TOKENS[platform]));
}

// ---------------------------------------------------------------------------
// GET /api/account/links — your Slack and Discord accounts
// ---------------------------------------------------------------------------

export async function handleGetAccountLinks(req: Request): Promise<Response> {
  const auth = await requireAuth(req);
  if ("error" in auth) return auth.error;

  const identities = await db
    .select()
    .from(platformIdentities)
    .where(
      and(
        eq(platformIdentities.userId, auth.user.id),
        inArray(platformIdentities.platform, [...LINKABLE_PLATFORMS]),
      ),
    );

  const links: AccountLinks = {
    platforms: configuredPlatforms(),
    identities: identities.map((identity) => ({
      id: identity.id,
      platform: identity.platform,
      platformUserId: identity.platformUserId,
      platformUsername: identity.platformUsername,
    })),
  };
  return Response.json(links);
}

// ---------------------------------------------------------------------------
// POST /api/account/links/:platform/code — a code to send Kyle from that account
// ---------------------------------------------------------------------------

export async function handleCreateLinkCode(req: Request, platform: string): Promise<Response> {
  const auth = await requireAuth(req);
  if ("error" in auth) return auth.error;

  if (!isLinkablePlatform(platform) || !configuredPlatforms().includes(platform)) {
    return Response.json({ error: "Unknown platform" }, { status: 404 });
  }

  return Response.json(await issueLinkCode(auth.user.id, platform));
}

// ---------------------------------------------------------------------------
// DELETE /api/account/links/:linkId — unlink one of your own accounts
// ---------------------------------------------------------------------------

export async function handleDeleteAccountLink(req: Request, linkId: string): Promise<Response> {
  const auth = await requireAuth(req);
  if ("error" in auth) return auth.error;
  if (!isUuid(linkId)) return Response.json({ error: "Invalid id" }, { status: 400 });

  const [deleted] = await db
    .delete(platformIdentities)
    .where(
      and(
        eq(platformIdentities.id, linkId),
        eq(platformIdentities.userId, auth.user.id),
        inArray(platformIdentities.platform, [...LINKABLE_PLATFORMS]),
      ),
    )
    .returning();
  if (!deleted) return Response.json({ error: "Link not found" }, { status: 404 });

  log.info("account unlinked by its owner", { userId: auth.user.id, platform: deleted.platform });
  return Response.json({ success: true });
}
