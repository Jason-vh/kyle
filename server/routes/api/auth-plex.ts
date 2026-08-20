import {
  completePlexAuth,
  PLEX_PLATFORM,
  startPlexAuth,
  type PlexAuthIntent,
} from "../../auth/plex.ts";
import { isPlexConfigured } from "../../plex/api.ts";
import type { PlexAccount } from "../../plex/types.ts";
import { buildJwtCookie, isLocalhost, signJwt } from "../../auth/jwt.ts";
import { requireAuth } from "../../auth/middleware.ts";
import {
  createPlatformLink,
  deletePlatformLink,
  getPlatformIdentity,
  getUserById,
  resolveAppUserId,
} from "../../db/users.ts";
import { createLogger } from "../../logger.ts";
import { errorMessage } from "../../errors.ts";

const log = createLogger("api-plex");

function redirect(location: string, headers: Record<string, string> = {}): Response {
  return new Response(null, { status: 302, headers: { Location: location, ...headers } });
}

/** Plex's numeric account id: stable, and the id a Plex Media Server reports usage against. */
function plexIdentityKey(account: PlexAccount): string {
  return String(account.id);
}

async function startFlow(intent: PlexAuthIntent): Promise<Response> {
  if (!isPlexConfigured()) {
    return Response.json({ error: "Plex sign-in is not configured" }, { status: 503 });
  }

  try {
    return Response.json({ authUrl: await startPlexAuth(intent) });
  } catch (error) {
    log.error("failed to start plex auth", { intent: intent.type, error: errorMessage(error) });
    return Response.json({ error: "Could not reach Plex" }, { status: 502 });
  }
}

// ---------------------------------------------------------------------------
// POST /api/auth/plex/login/start
// ---------------------------------------------------------------------------

export async function handlePlexLoginStart(_req: Request): Promise<Response> {
  return startFlow({ type: "login" });
}

// ---------------------------------------------------------------------------
// POST /api/auth/plex/link/start (connect Plex to the signed-in account)
// ---------------------------------------------------------------------------

export async function handlePlexLinkStart(req: Request): Promise<Response> {
  const auth = await requireAuth(req);
  if ("error" in auth) return auth.error;

  return startFlow({ type: "link", userId: auth.user.id });
}

// ---------------------------------------------------------------------------
// DELETE /api/auth/plex/link
// ---------------------------------------------------------------------------

export async function handlePlexUnlink(req: Request): Promise<Response> {
  const auth = await requireAuth(req);
  if ("error" in auth) return auth.error;

  const identity = await getPlatformIdentity(auth.user.id, PLEX_PLATFORM);
  if (!identity) {
    return Response.json({ error: "No Plex account linked" }, { status: 404 });
  }

  await deletePlatformLink(identity.id);

  log.info("plex account unlinked", { userId: auth.user.id });
  return Response.json({ success: true });
}

// ---------------------------------------------------------------------------
// GET /api/auth/plex/callback — where Plex forwards the browser back to
// ---------------------------------------------------------------------------

export async function handlePlexCallback(req: Request): Promise<Response> {
  const state = new URL(req.url).searchParams.get("state");
  if (!state) return redirect("/login?error=plex_expired");

  let result;
  try {
    result = await completePlexAuth(state);
  } catch (error) {
    log.error("plex callback failed", { error: errorMessage(error) });
    return redirect("/login?error=plex_failed");
  }

  if (result.status !== "ok") return redirect(`/login?error=plex_${result.status}`);

  const { intent, account } = result;
  return intent.type === "login"
    ? loginWithPlexAccount(req, account)
    : linkPlexAccount(intent.userId, account);
}

/** Signs in the Kyle user this Plex account is linked to. */
async function loginWithPlexAccount(req: Request, account: PlexAccount): Promise<Response> {
  const userId = await resolveAppUserId(PLEX_PLATFORM, plexIdentityKey(account));
  const user = userId ? await getUserById(userId) : undefined;
  if (!user) {
    log.warn("plex login for unlinked account", { plexUsername: account.username });
    return redirect("/login?error=plex_unlinked");
  }

  const token = await signJwt({ id: user.id, name: user.displayName, admin: user.isAdmin });

  log.info("plex login successful", { userId: user.id, name: user.displayName });
  return redirect("/threads", { "Set-Cookie": buildJwtCookie(token, isLocalhost(req)) });
}

/** Attaches this Plex account to the user who started the link flow. */
async function linkPlexAccount(userId: string, account: PlexAccount): Promise<Response> {
  const linkedTo = await resolveAppUserId(PLEX_PLATFORM, plexIdentityKey(account));
  if (linkedTo === userId) return redirect("/account");
  if (linkedTo) {
    log.warn("plex account already linked elsewhere", { userId, plexUsername: account.username });
    return redirect("/account?error=plex_taken");
  }

  if (await getPlatformIdentity(userId, PLEX_PLATFORM)) {
    return redirect("/account?error=plex_exists");
  }

  await createPlatformLink(userId, PLEX_PLATFORM, plexIdentityKey(account), account.username);

  log.info("plex account linked", { userId, plexUsername: account.username });
  return redirect("/account?linked=plex");
}
