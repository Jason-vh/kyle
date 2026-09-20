import { timingSafeEqual } from "crypto";
import { createLogger } from "#server/logger.ts";
import { isLocalDevelopmentRequest } from "#server/config.ts";

const log = createLogger("webhooks:auth");

export function checkWebhookAuth(req: Request): Response | null {
  const expected = process.env.WEBHOOK_AUTH;
  if (!expected) {
    if (isLocalDevelopmentRequest(req)) return null;
    return Response.json({ error: "Webhook authentication is not configured" }, { status: 503 });
  }

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
