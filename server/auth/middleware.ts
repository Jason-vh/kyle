import { userRateLimit } from "#server/http/rate-limit.ts";
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

const refreshCookies = new WeakMap<Request, string>();

export function withSessionRefresh<Args extends unknown[]>(
  handler: (req: Request, ...args: Args) => Promise<Response>,
): (req: Request, ...args: Args) => Promise<Response> {
  return async (req, ...args) => {
    try {
      const response = await handler(req, ...args);
      const cookie = refreshCookies.get(req);
      const hasAuthCookie = response.headers
        .getSetCookie()
        .some((value) => value.startsWith("kyle_auth="));
      if (cookie && !hasAuthCookie) response.headers.append("Set-Cookie", cookie);
      return response;
    } finally {
      refreshCookies.delete(req);
    }
  };
}

export type AuthResult = { user: JwtUser } | { error: Response };

/**
 * Require authentication. Returns the user or an error response. A session
 * near its expiry is renewed here and the cookie left for `withSessionRefresh`
 * to attach, so no handler has to remember to carry it.
 */
export async function requireAuth(req: Request): Promise<AuthResult> {
  const user = await optionalAuth(req);
  if (!user) {
    return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const rateLimit = userRateLimit(req, user.id);
  if (rateLimit) return { error: rateLimit };

  const jwtToken = getJwtFromRequest(req);
  if (jwtToken && (await shouldRefreshJwt(jwtToken))) {
    const newToken = await signJwt(user);
    refreshCookies.set(req, buildJwtCookie(newToken, isLocalhost(req)));
  }

  return { user };
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
