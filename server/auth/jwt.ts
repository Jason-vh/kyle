import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { and, eq, gt, lt } from "drizzle-orm";
import { db } from "#server/db/index.ts";
import { authSessions } from "#server/db/schema.ts";
import { getActiveUser } from "./account.ts";

const JWT_COOKIE = "kyle_auth";
const JWT_MAX_AGE_DAYS = 30;
const JWT_SLIDING_WINDOW_DAYS = 15;

export interface JwtUser {
  id: string;
  name: string;
  admin: boolean;
  sessionId?: string;
}

interface KyleJwtPayload extends JWTPayload {
  sub: string;
  name: string;
  admin: boolean;
}

let secret: Uint8Array | null = null;

function getSecret(): Uint8Array {
  if (secret) return secret;
  const raw = process.env.JWT_SECRET;
  if (!raw) {
    throw new Error("JWT_SECRET environment variable is required");
  }
  secret = new TextEncoder().encode(raw);
  return secret;
}

export async function signJwt(user: JwtUser): Promise<string> {
  const sessionId = user.sessionId ?? crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + JWT_MAX_AGE_DAYS * 86_400_000);
  if (user.sessionId) {
    const updated = await db
      .update(authSessions)
      .set({ expiresAt })
      .where(
        and(
          eq(authSessions.id, sessionId),
          eq(authSessions.userId, user.id),
          gt(authSessions.expiresAt, now),
        ),
      )
      .returning();
    if (!updated.length) throw new Error("Session expired or revoked");
  } else {
    await db.delete(authSessions).where(lt(authSessions.expiresAt, now));
    await db.insert(authSessions).values({ id: sessionId, userId: user.id, expiresAt });
  }
  return new SignJWT({ name: user.name, admin: user.admin })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(sessionId)
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${JWT_MAX_AGE_DAYS}d`)
    .sign(getSecret());
}

export async function verifyJwt(token: string): Promise<JwtUser | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: ["HS256"] });
    const p = payload as KyleJwtPayload;
    if (!p.sub || !p.jti) return null;
    const session = await db.query.authSessions.findFirst({
      where: and(
        eq(authSessions.id, p.jti),
        eq(authSessions.userId, p.sub),
        gt(authSessions.expiresAt, new Date()),
      ),
    });
    if (!session) return null;
    const user = await getActiveUser(p.sub);
    if (!user) return null;
    return { id: user.id, name: user.displayName, admin: user.isAdmin, sessionId: session.id };
  } catch {
    return null;
  }
}

/**
 * Check if the JWT should be re-issued (sliding window).
 * Returns true if the token has less than SLIDING_WINDOW_DAYS remaining.
 */
export async function shouldRefreshJwt(token: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (!payload.exp) return false;
    const remainingMs = payload.exp * 1000 - Date.now();
    return remainingMs < JWT_SLIDING_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

export async function revokeSession(req: Request): Promise<void> {
  const user = await parseAuthCookie(req);
  if (user?.sessionId) await db.delete(authSessions).where(eq(authSessions.id, user.sessionId));
}

export async function revokeUserSessions(userId: string): Promise<void> {
  await db.delete(authSessions).where(eq(authSessions.userId, userId));
}

export function isLocalhost(req: Request): boolean {
  const url = new URL(req.url);
  return url.hostname === "localhost" || url.hostname === "127.0.0.1";
}

export function buildJwtCookie(token: string, isLocal: boolean): string {
  const parts = [
    `${JWT_COOKIE}=${token}`,
    `Path=/`,
    `Max-Age=${JWT_MAX_AGE_DAYS * 24 * 60 * 60}`,
    `HttpOnly`,
    `SameSite=Strict`,
  ];
  if (!isLocal) parts.push("Secure");
  return parts.join("; ");
}

export function clearJwtCookie(isLocal: boolean): string {
  const parts = [`${JWT_COOKIE}=`, `Path=/`, `Max-Age=0`, `HttpOnly`, `SameSite=Strict`];
  if (!isLocal) parts.push("Secure");
  return parts.join("; ");
}

export function parseCookies(header: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const part of header.split("; ")) {
    const eq = part.indexOf("=");
    if (eq > 0) {
      cookies[part.slice(0, eq)] = part.slice(eq + 1);
    }
  }
  return cookies;
}

export function getJwtFromRequest(req: Request): string | null {
  const cookieHeader = req.headers.get("cookie");
  if (!cookieHeader) return null;
  const cookies = parseCookies(cookieHeader);
  return cookies[JWT_COOKIE] ?? null;
}

/**
 * Parse JWT from request and return user if valid.
 */
export async function parseAuthCookie(req: Request): Promise<JwtUser | null> {
  const token = getJwtFromRequest(req);
  if (!token) return null;
  return verifyJwt(token);
}
