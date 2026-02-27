import { createLogger } from "../logger.ts";

const log = createLogger("threads-auth");

const COOKIE_NAME = "kyle_thread_auth";
const COOKIE_MAX_AGE = 31536000; // 1 year

function parseCookies(header: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const part of header.split("; ")) {
    const eq = part.indexOf("=");
    if (eq > 0) {
      cookies[part.slice(0, eq)] = part.slice(eq + 1);
    }
  }
  return cookies;
}

async function signToken(token: string): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(token),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(timestamp)
  );
  const hex = Buffer.from(sig).toString("hex");
  return `${hex}.${timestamp}`;
}

async function verifyToken(
  cookie: string,
  token: string
): Promise<boolean> {
  const dot = cookie.lastIndexOf(".");
  if (dot < 0) return false;
  const hex = cookie.slice(0, dot);
  const timestamp = cookie.slice(dot + 1);
  if (!hex || !timestamp) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(token),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(timestamp)
  );
  const computed = Buffer.from(sig).toString("hex");

  if (computed.length !== hex.length) return false;
  const { timingSafeEqual } = await import("crypto");
  return timingSafeEqual(Buffer.from(computed), Buffer.from(hex));
}

function isLocalhost(req: Request): boolean {
  const url = new URL(req.url);
  return (
    url.hostname === "localhost" || url.hostname === "127.0.0.1"
  );
}

function buildCookieHeader(value: string, isLocal: boolean): string {
  const parts = [
    `${COOKIE_NAME}=${value}`,
    `Path=/threads`,
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
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(token),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(threadTs)
  );
  return Buffer.from(sig).toString("hex").slice(0, 32);
}

export async function verifyThreadSig(
  threadTs: string,
  sig: string
): Promise<boolean> {
  if (!sig || sig.length !== 32) return false;
  const expected = await signThreadSig(threadTs).catch(() => null);
  if (!expected) return false;
  const { timingSafeEqual } = await import("crypto");
  return timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
}

export async function checkAuth(
  req: Request,
  url: URL
): Promise<Response | null> {
  const token = process.env.THREAD_VIEWER_TOKEN;
  if (!token) {
    log.warn("THREAD_VIEWER_TOKEN not set");
    return new Response("Thread viewer not configured", { status: 503 });
  }

  const cookieHeader = req.headers.get("cookie");
  if (cookieHeader) {
    const cookies = parseCookies(cookieHeader);
    const value = cookies[COOKIE_NAME];
    if (value && (await verifyToken(value, token))) {
      return null; // authorized
    }
  }

  const redirect = encodeURIComponent(url.pathname);
  return Response.redirect(
    new URL(`/threads/login?redirect=${redirect}`, url.origin).toString(),
    302
  );
}

const LOGIN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Kyle — Login</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0d1117; color: #c9d1d9; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
  .card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 2rem; width: 100%; max-width: 360px; }
  h1 { font-size: 1.25rem; margin-bottom: 1.5rem; text-align: center; }
  label { display: block; font-size: 0.875rem; margin-bottom: 0.5rem; color: #8b949e; }
  input[type="password"] { width: 100%; padding: 0.5rem 0.75rem; background: #0d1117; border: 1px solid #30363d; border-radius: 6px; color: #c9d1d9; font-size: 1rem; }
  input[type="password"]:focus { outline: none; border-color: #58a6ff; }
  button { width: 100%; margin-top: 1rem; padding: 0.5rem; background: #238636; border: 1px solid #2ea043; border-radius: 6px; color: #fff; font-size: 1rem; cursor: pointer; }
  button:hover { background: #2ea043; }
  .error { color: #f85149; font-size: 0.875rem; margin-bottom: 1rem; text-align: center; }
</style>
</head>
<body>
<div class="card">
  <h1>Kyle Thread Viewer</h1>
  {{ERROR}}
  <form method="POST">
    <label for="token">Token</label>
    <input type="password" id="token" name="token" autofocus required>
    <button type="submit">Log in</button>
  </form>
</div>
</body>
</html>`;

export async function handleLogin(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const redirect = url.searchParams.get("redirect") || "/threads/";

  if (req.method === "GET") {
    const html = LOGIN_HTML.replace("{{ERROR}}", "");
    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // POST
  const token = process.env.THREAD_VIEWER_TOKEN;
  if (!token) {
    return new Response("Thread viewer not configured", { status: 503 });
  }

  const formData = await req.formData();
  const submitted = formData.get("token");

  if (!submitted || submitted !== token) {
    log.warn("invalid login attempt");
    const html = LOGIN_HTML.replace(
      "{{ERROR}}",
      '<p class="error">Invalid token</p>'
    );
    return new Response(html, {
      status: 401,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const signed = await signToken(token);
  const isLocal = isLocalhost(req);

  log.info("login successful");
  return new Response(null, {
    status: 302,
    headers: {
      Location: redirect,
      "Set-Cookie": buildCookieHeader(signed, isLocal),
    },
  });
}
