import {
  parseCookies,
  verifyToken,
  signToken,
  isLocalhost,
  buildCookieHeader,
} from "../threads-auth.ts";
import { createLogger } from "../../logger.ts";

const log = createLogger("api-auth");

export async function handleApiLogin(req: Request): Promise<Response> {
  const token = process.env.THREAD_VIEWER_TOKEN;
  if (!token) {
    return Response.json({ error: "Thread viewer not configured" }, { status: 503 });
  }

  let body: { token?: string };
  try {
    body = (await req.json()) as { token?: string };
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const submitted = body.token;
  if (!submitted) {
    return Response.json({ error: "Token required" }, { status: 400 });
  }

  const { timingSafeEqual } = await import("crypto");
  const submittedBuf = Buffer.from(submitted);
  const tokenBuf = Buffer.from(token);
  if (submittedBuf.length !== tokenBuf.length || !timingSafeEqual(submittedBuf, tokenBuf)) {
    log.warn("invalid api login attempt");
    return Response.json({ error: "Invalid token" }, { status: 401 });
  }

  const signed = await signToken(token);
  const isLocal = isLocalhost(req);

  log.info("api login successful");
  return Response.json(
    { success: true },
    {
      headers: {
        "Set-Cookie": buildCookieHeader(signed, isLocal),
      },
    },
  );
}

export async function handleApiAuthStatus(req: Request): Promise<Response> {
  const token = process.env.THREAD_VIEWER_TOKEN;
  if (!token) {
    return Response.json({ authenticated: false });
  }

  const cookieHeader = req.headers.get("cookie");
  if (cookieHeader) {
    const cookies = parseCookies(cookieHeader);
    const value = cookies["kyle_thread_auth"];
    if (value && (await verifyToken(value, token))) {
      return Response.json({ authenticated: true });
    }
  }

  return Response.json({ authenticated: false });
}
