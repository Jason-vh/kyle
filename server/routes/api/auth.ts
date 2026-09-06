import { parseAuthCookie, clearJwtCookie, isLocalhost } from "#server/auth/jwt.ts";
import { PLEX_PLATFORM } from "#server/auth/plex.ts";
import { isPlexConfigured } from "#server/plex/api.ts";
import { getPlatformIdentity } from "#server/db/users.ts";
import { createLogger } from "#server/logger.ts";

const log = createLogger("api-auth");

export async function handleApiAuthStatus(req: Request): Promise<Response> {
  const jwtUser = await parseAuthCookie(req);
  const plexEnabled = isPlexConfigured();

  if (jwtUser) {
    const plex = await getPlatformIdentity(jwtUser.id, PLEX_PLATFORM);
    return Response.json({
      authenticated: true,
      plexEnabled,
      user: {
        id: jwtUser.id,
        name: jwtUser.name,
        admin: jwtUser.admin,
        plexUsername: plex?.platformUsername ?? null,
      },
    });
  }

  return Response.json({ authenticated: false, plexEnabled });
}

export async function handleApiLogout(req: Request): Promise<Response> {
  const isLocal = isLocalhost(req);

  const headers = new Headers();
  headers.append("Set-Cookie", clearJwtCookie(isLocal));

  log.info("user logged out");
  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers,
  });
}
