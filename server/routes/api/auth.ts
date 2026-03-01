import { parseAuthCookie, clearJwtCookie, isLocalhost } from "../../auth/jwt.ts";
import { createLogger } from "../../logger.ts";

const log = createLogger("api-auth");

export async function handleApiAuthStatus(req: Request): Promise<Response> {
  const jwtUser = await parseAuthCookie(req);
  if (jwtUser) {
    return Response.json({
      authenticated: true,
      user: { id: jwtUser.id, name: jwtUser.name, admin: jwtUser.admin },
    });
  }

  return Response.json({ authenticated: false });
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
