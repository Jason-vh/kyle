import {
  parseAuthCookie,
  getJwtFromRequest,
  shouldRefreshJwt,
  signJwt,
  buildJwtCookie,
  isLocalhost,
  type JwtUser,
} from "./jwt.ts";

/**
 * Try to authenticate via JWT cookie.
 */
export async function optionalAuth(req: Request): Promise<JwtUser | null> {
  return parseAuthCookie(req);
}

export type AuthResult =
  | { user: JwtUser; refreshHeaders?: Record<string, string> }
  | { error: Response };

/**
 * Require authentication. Returns the user or an error response.
 * Also handles JWT sliding window refresh.
 */
export async function requireAuth(req: Request): Promise<AuthResult> {
  const user = await optionalAuth(req);
  if (!user) {
    return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  // Check sliding window refresh
  const result: AuthResult = { user };
  const jwtToken = getJwtFromRequest(req);
  if (jwtToken && (await shouldRefreshJwt(jwtToken))) {
    const newToken = await signJwt(user);
    result.refreshHeaders = {
      "Set-Cookie": buildJwtCookie(newToken, isLocalhost(req)),
    };
  }

  return result;
}

/**
 * Require admin authentication.
 */
export async function requireAdmin(req: Request): Promise<AuthResult> {
  const result = await requireAuth(req);
  if ("error" in result) return result;
  if (!result.user.admin) {
    return { error: Response.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return result;
}
