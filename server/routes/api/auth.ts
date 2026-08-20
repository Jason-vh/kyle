import { parseAuthCookie, clearJwtCookie, isLocalhost } from "../../auth/jwt.ts";
import { PLEX_PLATFORM } from "../../auth/plex.ts";
import { isPlexConfigured } from "../../plex/api.ts";
import { getPlatformIdentity } from "../../db/users.ts";
import { createLogger } from "../../logger.ts";

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
