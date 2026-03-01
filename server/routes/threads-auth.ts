const COOKIE_NAME = "kyle_thread_auth";
const COOKIE_MAX_AGE = 31536000; // 1 year

let cachedKey: CryptoKey | null = null;
let cachedToken: string | null = null;

async function getHmacKey(token: string): Promise<CryptoKey> {
  if (cachedKey && cachedToken === token) return cachedKey;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(token),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  cachedKey = key;
  cachedToken = token;
  return key;
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

export async function signToken(token: string): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const key = await getHmacKey(token);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(timestamp));
  const hex = Buffer.from(sig).toString("hex");
  return `${hex}.${timestamp}`;
}

export async function verifyToken(cookie: string, token: string): Promise<boolean> {
  const dot = cookie.lastIndexOf(".");
  if (dot < 0) return false;
  const hex = cookie.slice(0, dot);
  const timestamp = cookie.slice(dot + 1);
  if (!hex || !timestamp) return false;

  const key = await getHmacKey(token);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(timestamp));
  const computed = Buffer.from(sig).toString("hex");

  if (computed.length !== hex.length) return false;
  const { timingSafeEqual } = await import("crypto");
  if (!timingSafeEqual(Buffer.from(computed), Buffer.from(hex))) return false;

  // After confirming the signature is valid, check the age
  const age = Math.floor(Date.now() / 1000) - parseInt(timestamp, 10);
  if (isNaN(age) || age < 0 || age > COOKIE_MAX_AGE) return false;

  return true;
}

export function isLocalhost(req: Request): boolean {
  const url = new URL(req.url);
  return url.hostname === "localhost" || url.hostname === "127.0.0.1";
}

export function buildCookieHeader(value: string, isLocal: boolean): string {
  const parts = [
    `${COOKIE_NAME}=${value}`,
    `Path=/`,
    `Max-Age=${COOKIE_MAX_AGE}`,
    `HttpOnly`,
    `SameSite=Strict`,
  ];
  if (!isLocal) parts.push("Secure");
  return parts.join("; ");
}

export async function signThreadSig(threadTs: string): Promise<string> {
  const token = process.env.THREAD_VIEWER_TOKEN;
  if (!token) throw new Error("THREAD_VIEWER_TOKEN not set");
  const key = await getHmacKey(token);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(threadTs));
  return Buffer.from(sig).toString("hex").slice(0, 32);
}

export async function verifyThreadSig(threadTs: string, sig: string): Promise<boolean> {
  if (!sig || sig.length !== 32) return false;
  const expected = await signThreadSig(threadTs).catch(() => null);
  if (!expected) return false;
  const { timingSafeEqual } = await import("crypto");
  return timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
}
