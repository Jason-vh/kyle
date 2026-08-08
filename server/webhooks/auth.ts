import { timingSafeEqual } from "crypto";
import { createLogger } from "../logger.ts";

const log = createLogger("webhooks:auth");

/**
 * Checks the basic-auth credentials Sonarr and Radarr send, if WEBHOOK_AUTH is
 * configured. Returns a response to send back, or null when the request may proceed.
 */
export function checkWebhookAuth(req: Request): Response | null {
  const expected = process.env.WEBHOOK_AUTH;
  if (!expected) return null;

  const unauthorized = () => Response.json({ error: "Unauthorized" }, { status: 401 });

  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Basic ")) {
    log.warn("webhook request missing basic auth");
    return unauthorized();
  }

  const actual = Buffer.from(Buffer.from(authHeader.slice(6), "base64").toString("utf-8"));
  const expectedBytes = Buffer.from(expected);
  if (expectedBytes.length !== actual.length || !timingSafeEqual(expectedBytes, actual)) {
    log.warn("webhook request invalid credentials");
    return unauthorized();
  }

  return null;
}
