import { afterEach, beforeEach, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "#server/db/index.ts";
import { users } from "#server/db/schema.ts";
import {
  createPlatformLink,
  createUserWithPlatformLink,
  deletePlatformLink,
  getPlatformIdentity,
} from "#server/db/users.ts";
import { createTestUser, deleteTestUser } from "#server/db/testing.ts";
import { buildJwtCookie, signJwt, verifyJwt } from "#server/auth/jwt.ts";
import { invalidatePlexAccessCache } from "#server/plex/access.ts";
import {
  handlePlexCallback,
  handlePlexLinkStart,
  handlePlexLoginStart,
  handlePlexUnlink,
} from "./auth-plex.ts";

const originalFetch = globalThis.fetch;
const envNames = [
  "PLEX_CLIENT_IDENTIFIER",
  "PLEX_SERVER_URL",
  "PLEX_SERVER_TOKEN",
  "PUBLIC_ORIGIN",
] as const;
let saved: Partial<Record<(typeof envNames)[number], string>>;
const userIds: string[] = [];
let shared = true;

beforeEach(() => {
  saved = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
  process.env.PLEX_CLIENT_IDENTIFIER = "auth-test";
  process.env.PLEX_SERVER_URL = "http://plex.test";
  process.env.PLEX_SERVER_TOKEN = "owner-test-token";
  process.env.PUBLIC_ORIGIN = "http://localhost";
  process.env.JWT_SECRET ??= "test-only-secret";
  shared = true;
  invalidatePlexAccessCache();
  globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
    if (url.endsWith("/pins?strong=true")) return Response.json({ id: 42, code: "pin" });
    if (url.endsWith("/pins/42")) return Response.json({ authToken: "claimed-token" });
    if (url.endsWith("/user")) {
      if (new Headers(init.headers).get("X-Plex-Token") === "claimed-token") {
        return Response.json({ id: 999, username: "member", title: "Member" });
      }
      return Response.json({ id: 1, username: "owner", title: "Owner" });
    }
    if (url.endsWith("/identity"))
      return Response.json({ MediaContainer: { machineIdentifier: "server" } });
    if (url.endsWith("/users"))
      return new Response(
        shared
          ? '<MediaContainer><User id="999" username="member"><Server id="1" machineIdentifier="server" pending="0"/></User></MediaContainer>'
          : "<MediaContainer/>",
      );
    return new Response("Unexpected test upstream", { status: 500 });
  }) as unknown as typeof fetch;
});

afterEach(async () => {
  globalThis.fetch = originalFetch;
  invalidatePlexAccessCache();
  for (const name of envNames) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
  for (const id of userIds.splice(0)) await deleteTestUser(id);
});

async function flow(response: Response) {
  const body = (await response.json()) as { authUrl: string };
  return {
    callback: new URLSearchParams(body.authUrl.split("#?")[1]).get("forwardUrl")!,
    cookie: response.headers.get("set-cookie")!.split(";")[0]!,
  };
}

async function plexUser() {
  const user = await createUserWithPlatformLink({
    displayName: "Member",
    isAdmin: false,
    platform: "plex",
    platformUserId: "999",
  });
  userIds.push(user.id);
  return user;
}

async function loginWithPlex() {
  const login = await flow(await handlePlexLoginStart(new Request("http://localhost/start")));
  return handlePlexCallback(new Request(login.callback, { headers: { cookie: login.cookie } }));
}

async function userFromResponse(response: Response) {
  expect(response.headers.get("location")).toBe("/home");
  const cookie = response.headers.getSetCookie().find((value) => value.startsWith("kyle_auth="))!;
  return verifyJwt(cookie.split(";")[0]!.slice("kyle_auth=".length));
}

test("Plex sign-in recovers the same account after unlinking its only credential", async () => {
  const user = await plexUser();
  const auth = buildJwtCookie(await signJwt({ id: user.id, name: "Member", admin: false }), true);
  const response = await handlePlexUnlink(
    new Request("http://localhost/api/auth/plex/link", {
      method: "DELETE",
      headers: { cookie: auth },
    }),
  );
  expect(response.status).toBe(200);
  expect(await getPlatformIdentity(user.id, "plex")).toBeUndefined();
  expect(await userFromResponse(await loginWithPlex())).toMatchObject({ id: user.id });
  expect((await getPlatformIdentity(user.id, "plex"))?.platformUserId).toBe("999");
  expect(await db.select().from(users).where(eq(users.plexAccountId, "999"))).toHaveLength(1);
});

test("recovers the most recently linked account, including accounts not created through Plex", async () => {
  const original = await plexUser();
  await deletePlatformLink((await getPlatformIdentity(original.id, "plex"))!.id);
  const latestId = await createTestUser("Latest account");
  userIds.push(latestId);
  const { link } = await createPlatformLink(latestId, "plex", "999", "member");
  await deletePlatformLink(link.id);

  expect(await userFromResponse(await loginWithPlex())).toMatchObject({ id: latestId });
  expect(await getPlatformIdentity(original.id, "plex")).toBeUndefined();
});

test.each(["disabled", "removed"])("recovery cannot bypass %s access", async (reason) => {
  const user = await plexUser();
  await deletePlatformLink((await getPlatformIdentity(user.id, "plex"))!.id);
  if (reason === "disabled") {
    await db.update(users).set({ isDisabled: true }).where(eq(users.id, user.id));
  } else {
    shared = false;
    invalidatePlexAccessCache();
  }

  const response = await loginWithPlex();
  expect(response.headers.get("location")).toBe("/login?error=plex_no_access");
  expect(response.headers.get("set-cookie")).toBeNull();
  expect(await getPlatformIdentity(user.id, "plex")).toBeUndefined();
  expect(await db.select().from(users).where(eq(users.plexAccountId, "999"))).toHaveLength(1);
});

test("recovery does not replace another Plex account already linked to the user", async () => {
  const user = await plexUser();
  await deletePlatformLink((await getPlatformIdentity(user.id, "plex"))!.id);
  await createPlatformLink(user.id, "plex", "123", "other");

  expect((await loginWithPlex()).headers.get("location")).toBe("/login?error=plex_exists");
  expect((await getPlatformIdentity(user.id, "plex"))?.platformUserId).toBe("123");
});

test("concurrent recovery callbacks relink one account", async () => {
  const user = await plexUser();
  await deletePlatformLink((await getPlatformIdentity(user.id, "plex"))!.id);
  const responses = await Promise.all([loginWithPlex(), loginWithPlex()]);
  for (const response of responses) {
    expect(await userFromResponse(response)).toMatchObject({ id: user.id });
  }
  expect(await db.select().from(users).where(eq(users.plexAccountId, "999"))).toHaveLength(1);
});

test("an existing Plex user is refused after server access is removed", async () => {
  await plexUser();
  shared = false;
  const login = await flow(await handlePlexLoginStart(new Request("http://localhost/start")));
  const response = await handlePlexCallback(
    new Request(login.callback, { headers: { cookie: login.cookie } }),
  );

  expect(response.headers.get("location")).toBe("/login?error=plex_no_access");
  expect(response.headers.get("set-cookie")).toBeNull();
});

test("removing Plex access invalidates an already issued session", async () => {
  const user = await plexUser();
  const token = await signJwt({ id: user.id, name: user.displayName, admin: false });
  expect(await verifyJwt(token)).not.toBeNull();
  shared = false;
  invalidatePlexAccessCache();
  expect(await verifyJwt(token)).toBeNull();
});

test("link callbacks require the authenticated initiator's browser binding", async () => {
  const id = await createTestUser();
  userIds.push(id);
  const auth = buildJwtCookie(await signJwt({ id, name: "Initiator", admin: false }), true);
  const link = await flow(
    await handlePlexLinkStart(new Request("http://localhost/start", { headers: { cookie: auth } })),
  );

  const unbound = await handlePlexCallback(new Request(link.callback));
  expect(unbound.headers.get("location")).toBe("/login?error=plex_denied");
  expect(await getPlatformIdentity(id, "plex")).toBeUndefined();
  const bound = await handlePlexCallback(
    new Request(link.callback, { headers: { cookie: link.cookie } }),
  );
  expect(bound.headers.get("location")).toBe("/account?linked=plex");
  expect((await getPlatformIdentity(id, "plex"))?.platformUserId).toBe("999");
});
