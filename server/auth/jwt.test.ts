import { afterEach, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "#server/db/index.ts";
import { users } from "#server/db/schema.ts";
import { createTestUser, deleteTestUser } from "#server/db/testing.ts";
import { buildJwtCookie, revokeUserSessions, signJwt, verifyJwt } from "./jwt.ts";
import { requireAdmin } from "./middleware.ts";
import { handleApiLogout } from "#server/routes/api/auth.ts";
import { invalidatePlexAccessCache } from "#server/plex/access.ts";

process.env.JWT_SECRET ??= "test-only-secret";
const userIds: string[] = [];
const originalFetch = globalThis.fetch;

afterEach(async () => {
  globalThis.fetch = originalFetch;
  invalidatePlexAccessCache();
  for (const id of userIds.splice(0)) await deleteTestUser(id);
});

async function account(admin = false) {
  const id = await createTestUser("Session test", admin);
  userIds.push(id);
  return { id, name: "Session test", admin };
}

function request(token: string) {
  return new Request("http://localhost/api/auth/logout", {
    headers: { cookie: buildJwtCookie(token, true) },
  });
}

test("demotion is enforced on an existing token and its refresh", async () => {
  const user = await account(true);
  const token = await signJwt(user);
  await db
    .update(users)
    .set({ isAdmin: false, displayName: "Renamed" })
    .where(eq(users.id, user.id));

  const result = await requireAdmin(request(token));
  expect("error" in result && result.error.status).toBe(403);
  const current = await verifyJwt(token);
  expect(current).toMatchObject({ admin: false, name: "Renamed" });
  expect(await verifyJwt(await signJwt(current!))).toMatchObject({ admin: false });
});

test("logout revokes only that device, including a copied cookie", async () => {
  const user = await account();
  const first = await signJwt(user);
  const second = await signJwt(user);
  await handleApiLogout(request(first));

  expect(await verifyJwt(first)).toBeNull();
  expect(await verifyJwt(second)).not.toBeNull();
});

test("revoking all sessions cannot be undone by a pending refresh", async () => {
  const user = await account();
  const token = await signJwt(user);
  const current = await verifyJwt(token);
  await revokeUserSessions(user.id);

  expect(await verifyJwt(token)).toBeNull();
  await expect(signJwt(current!)).rejects.toThrow("revoked");
});

test("disabled and deleted accounts cannot use an existing session", async () => {
  const user = await account();
  const token = await signJwt(user);
  await db.update(users).set({ isDisabled: true }).where(eq(users.id, user.id));
  expect(await verifyJwt(token)).toBeNull();
  await deleteTestUser(user.id);
  expect(await verifyJwt(token)).toBeNull();
});

test("Plex-origin accounts cannot bypass membership checks with a passkey session", async () => {
  const user = await account();
  await db.update(users).set({ plexAccountId: "removed-plex-member" }).where(eq(users.id, user.id));
  globalThis.fetch = (async () => new Response(null, { status: 503 })) as unknown as typeof fetch;
  const token = await signJwt(user);

  expect(await verifyJwt(token)).toBeNull();
});
