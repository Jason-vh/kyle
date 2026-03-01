import { SignJWT, jwtVerify, type JWTPayload } from "jose";

const JWT_COOKIE = "kyle_auth";
const JWT_MAX_AGE_DAYS = 30;
const JWT_SLIDING_WINDOW_DAYS = 15;

export interface JwtUser {
  id: string;
  name: string;
  admin: boolean;
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
  return new SignJWT({ name: user.name, admin: user.admin })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${JWT_MAX_AGE_DAYS}d`)
    .sign(getSecret());
}

export async function verifyJwt(token: string): Promise<JwtUser | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const p = payload as KyleJwtPayload;
    if (!p.sub || typeof p.name !== "string") return null;
    return { id: p.sub, name: p.name, admin: !!p.admin };
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
