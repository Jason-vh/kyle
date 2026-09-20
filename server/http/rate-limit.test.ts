import { afterEach, expect, test } from "bun:test";
import {
  clientAddress,
  createRateLimiter,
  userRateLimit,
  withAuthenticationLimit,
} from "./rate-limit.ts";

const originalTrust = process.env.TRUST_PROXY;
afterEach(() => {
  if (originalTrust === undefined) delete process.env.TRUST_PROXY;
  else process.env.TRUST_PROXY = originalTrust;
});

test("isolates callers and returns the remaining window before allowing a retry", () => {
  const check = createRateLimiter(2, 60_000);
  expect(check("one", 0)).toBeUndefined();
  expect(check("one", 1)).toBeUndefined();
  expect(check("one", 1000)).toBe(59);
  expect(check("two", 1000)).toBeUndefined();
  expect(check("one", 60_000)).toBeUndefined();
});

test("bounds memory without evicting limits attackers could then bypass", () => {
  const check = createRateLimiter(1, 60_000, 2);
  expect(check("one", 0)).toBeUndefined();
  expect(check("two", 0)).toBeUndefined();
  expect(check("three", 0)).toBe(60);
  expect(check("one", 0)).toBe(60);
  expect(check("three", 60_000)).toBeUndefined();
});

test("only trusts proxy client addresses when explicitly configured", () => {
  const req = new Request("http://localhost", { headers: { "x-real-ip": "198.51.100.1" } });
  delete process.env.TRUST_PROXY;
  expect(clientAddress(req, "127.0.0.1")).toBe("127.0.0.1");
  process.env.TRUST_PROXY = "true";
  expect(clientAddress(req, "127.0.0.1")).toBe("198.51.100.1");
  req.headers.set("x-real-ip", "arbitrary-key");
  expect(clientAddress(req, "127.0.0.1")).toBe("127.0.0.1");
});

test("blocks authentication floods before creating new flows, even with forged headers", async () => {
  delete process.env.TRUST_PROXY;
  let calls = 0;
  const handler = withAuthenticationLimit(async () => {
    calls++;
    return Response.json({ ok: true });
  });
  const server = { requestIP: () => ({ address: "198.51.100.50" }) };
  for (let i = 0; i < 20; i++) {
    const req = new Request("http://localhost/api/auth/passkey/login/options", {
      headers: { "x-real-ip": `198.51.100.${i}` },
    });
    expect((await handler(req, server)).status).toBe(200);
  }
  const response = await handler(new Request("http://localhost/api/auth/plex/login/start"), server);
  expect(response.status).toBe(429);
  expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
  expect(calls).toBe(20);
  expect(
    (
      await handler(new Request("http://localhost"), {
        requestIP: () => ({ address: "198.51.100.51" }),
      })
    ).status,
  ).toBe(200);
});

test("limits authenticated writes independently of reads and other users", () => {
  const user = crypto.randomUUID();
  const write = new Request("http://localhost/api/requests", { method: "POST" });
  for (let i = 0; i < 60; i++) expect(userRateLimit(write, user)).toBeUndefined();
  expect(userRateLimit(write, user)?.status).toBe(429);
  expect(userRateLimit(new Request("http://localhost/api/requests"), user)).toBeUndefined();
  expect(userRateLimit(write, crypto.randomUUID())).toBeUndefined();
});
