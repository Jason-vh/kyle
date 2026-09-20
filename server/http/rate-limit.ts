import { isIP } from "node:net";

export function createRateLimiter(limit: number, windowMs: number, maxKeys = 10_000) {
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    !Number.isSafeInteger(windowMs) ||
    windowMs < 1 ||
    !Number.isSafeInteger(maxKeys) ||
    maxKeys < 1
  ) {
    throw new Error("Invalid rate limits");
  }
  const buckets = new Map<string, { used: number; expires: number }>();
  return (key: string, now = Date.now()): number | undefined => {
    for (const [oldKey, bucket] of buckets) {
      if (bucket.expires > now) break;
      buckets.delete(oldKey);
    }
    let bucket = buckets.get(key);
    if (!bucket) {
      if (buckets.size >= maxKeys) {
        const first = buckets.values().next().value!;
        return Math.max(1, Math.ceil((first.expires - now) / 1000));
      }
      bucket = { used: 0, expires: now + windowMs };
      buckets.set(key, bucket);
    }
    if (bucket.used >= limit) return Math.max(1, Math.ceil((bucket.expires - now) / 1000));
    bucket.used++;
    return undefined;
  };
}

function limited(retryAfter: number): Response {
  return Response.json(
    { error: "Too many requests. Try again shortly." },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfter), "Cache-Control": "no-store" },
    },
  );
}

const reads = createRateLimiter(240, 60_000);
const writes = createRateLimiter(60, 60_000);

export function userRateLimit(req: Request, userId: string): Response | undefined {
  const check = req.method === "GET" || req.method === "HEAD" ? reads : writes;
  const retryAfter = check(userId);
  return retryAfter === undefined ? undefined : limited(retryAfter);
}

export function clientAddress(req: Request, peerAddress: string): string {
  if (process.env.TRUST_PROXY === "true") {
    const forwarded = req.headers.get("x-real-ip");
    if (forwarded && isIP(forwarded)) return forwarded;
  }
  return peerAddress;
}

const authenticationByAddress = createRateLimiter(20, 60_000);
const authenticationGlobal = createRateLimiter(100, 60_000, 1);

interface PeerAddressSource {
  requestIP(req: Request): { address: string } | null;
}

export function withAuthenticationLimit(handler: (req: Request) => Promise<Response>) {
  return async (req: Request, server: PeerAddressSource): Promise<Response> => {
    const address = clientAddress(req, server.requestIP(req)?.address ?? "unknown");
    const retryAfter = authenticationByAddress(address) ?? authenticationGlobal("authentication");
    if (retryAfter !== undefined) return limited(retryAfter);
    return handler(req);
  };
}
