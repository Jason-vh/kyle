import { afterAll, beforeAll, expect, test } from "bun:test";
import { SignJWT, decodeJwt } from "jose";
import { createTestUser, deleteTestUser } from "#server/db/testing.ts";
import { startServer } from "#server/server.ts";
import { signJwt, verifyJwt } from "./jwt.ts";

process.env.JWT_SECRET ??= "test-only-secret";
let userId: string;
let server: ReturnType<typeof startServer>;
let cookie: string;
let sessionId: string;

beforeAll(async () => {
  userId = await createTestUser("Session refresh", true);
  const original = await signJwt({ id: userId, name: "Session refresh", admin: true });
  const payload = decodeJwt(original);
  sessionId = payload.jti!;
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now - 20 * 86_400)
    .setExpirationTime(now + 10 * 86_400)
    .sign(new TextEncoder().encode(process.env.JWT_SECRET));
  cookie = `kyle_auth=${token}`;
  server = startServer(0);
});

afterAll(async () => {
  server?.stop(true);
  if (userId) await deleteTestUser(userId);
});

test.each([
  "/api/threads",
  "/api/users",
  "/api/auth/status",
  "/api/discover",
  "/api/notifications",
])("authenticated responses refresh aging sessions at %s", async (path) => {
  const response = await fetch(`http://localhost:${server.port}${path}`, { headers: { cookie } });
  expect(response.status).toBe(200);
  const cookies = response.headers.getSetCookie();
  expect(cookies).toHaveLength(1);
  const token = cookies[0]!.split(";")[0]!.slice("kyle_auth=".length);
  expect(await verifyJwt(token)).toMatchObject({ id: userId, sessionId });
  expect(decodeJwt(token).exp!).toBeGreaterThan(Math.floor(Date.now() / 1000) + 29 * 86_400);
});

test("registration preserves its flow cookie alongside session renewal", async () => {
  const response = await fetch(
    `http://localhost:${server.port}/api/auth/passkey/register/options`,
    {
      method: "POST",
      headers: { cookie },
    },
  );
  expect(response.status).toBe(200);
  const cookies = response.headers.getSetCookie();
  expect(cookies.some((value) => value.startsWith("kyle_passkey_register="))).toBe(true);
  expect(cookies.some((value) => value.startsWith("kyle_auth="))).toBe(true);
});

test("authenticated error responses still refresh the session", async () => {
  const response = await fetch(`http://localhost:${server.port}/api/auth/plex/link`, {
    method: "DELETE",
    headers: { cookie },
  });
  expect(response.status).toBe(404);
  expect(response.headers.get("set-cookie")).toStartWith("kyle_auth=");
});

test("logout clears rather than renews the session", async () => {
  const token = await signJwt({ id: userId, name: "Session refresh", admin: true });
  const response = await fetch(`http://localhost:${server.port}/api/auth/logout`, {
    method: "POST",
    headers: { cookie: `kyle_auth=${token}` },
  });
  expect(response.headers.getSetCookie()).toHaveLength(1);
  expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  expect(await verifyJwt(token)).toBeNull();
});
