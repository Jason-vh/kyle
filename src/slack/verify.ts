const FIVE_MINUTES = 5 * 60;

export async function verifySlackSignature(
  rawBody: string,
  timestamp: string | null,
  signature: string | null,
): Promise<boolean> {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret || !timestamp || !signature) return false;

  // Reject requests older than 5 minutes
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > FIVE_MINUTES) return false;

  const baseString = `v0:${timestamp}:${rawBody}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(signingSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(baseString));

  const computed = `v0=${Buffer.from(sig).toString("hex")}`;

  // Timing-safe comparison
  if (computed.length !== signature.length) return false;
  const { timingSafeEqual } = await import("crypto");
  return timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
}
