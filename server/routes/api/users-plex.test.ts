import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { inArray } from "drizzle-orm";
import { handleCreateLink, handleGetPlexAccounts } from "./users.ts";
import { buildJwtCookie, signJwt } from "#server/auth/jwt.ts";
import { createTestUser, deleteTestUser } from "#server/db/testing.ts";
import { db } from "#server/db/index.ts";
import { platformIdentities, plexAccountOwners } from "#server/db/schema.ts";
import { getPlatformIdentity } from "#server/db/users.ts";
import { invalidatePlexAccessCache } from "#server/plex/access.ts";
import type { LinkablePlexAccount } from "#shared/types.ts";

const originalFetch = globalThis.fetch;
const envNames = ["PLEX_SERVER_URL", "PLEX_SERVER_TOKEN"] as const;
let saved: Partial<Record<(typeof envNames)[number], string>>;

let hendri = "";
let adminId = "";
let asAdmin = "";

beforeAll(async () => {
  process.env.JWT_SECRET ??= "test-only-secret";
  hendri = await createTestUser("Hendri");
  adminId = await createTestUser("Plex Admin", true);
  asAdmin = buildJwtCookie(await signJwt({ id: adminId, name: "Admin", admin: true }), true).split(
    ";",
  )[0]!;
});

beforeEach(() => {
  saved = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
  process.env.PLEX_SERVER_URL = "http://plex.test";
  process.env.PLEX_SERVER_TOKEN = "owner-test-token";
  invalidatePlexAccessCache();
  globalThis.fetch = (async (url: string) => {
    if (url.endsWith("/user")) return Response.json({ id: 1, username: "owner", title: "Owner" });
    if (url.endsWith("/identity")) {
      return Response.json({ MediaContainer: { machineIdentifier: "server" } });
    }
    if (url.endsWith("/users")) {
      return new Response(
        '<MediaContainer><User id="2078" username="hen2078" title="hen2078"><Server id="1" machineIdentifier="server" pending="0"/></User></MediaContainer>',
      );
    }
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
  await db.delete(platformIdentities).where(inArray(platformIdentities.userId, [hendri, adminId]));
  await db.delete(plexAccountOwners).where(inArray(plexAccountOwners.userId, [hendri, adminId]));
});

afterAll(async () => {
  await deleteTestUser(hendri);
  await deleteTestUser(adminId);
});

function link(userId: string, platformUserId: string): Request {
  return new Request(`http://localhost/api/users/${userId}/links`, {
    method: "POST",
    headers: { Cookie: asAdmin, "Content-Type": "application/json" },
    body: JSON.stringify({ platform: "plex", platformUserId, platformUsername: "hen2078" }),
  });
}

async function unlinked(): Promise<string[]> {
  const response = await handleGetPlexAccounts(
    new Request("http://localhost/api/users/plex-accounts", { headers: { Cookie: asAdmin } }),
  );
  const { accounts } = (await response.json()) as { accounts: LinkablePlexAccount[] };
  return accounts.map((account) => account.username);
}

describe("linking someone to their Plex account", () => {
  test("offers everyone who can sign in with Plex and is not linked yet", async () => {
    expect(await unlinked()).toEqual(["owner", "hen2078"]);
  });

  test("links a member of the server, who then drops out of the choices", async () => {
    expect((await handleCreateLink(link(hendri, "2078"), hendri)).status).toBe(200);

    expect((await getPlatformIdentity(hendri, "plex"))?.platformUserId).toBe("2078");
    expect(await unlinked()).toEqual(["owner"]);
  });

  test("refuses an account without access to the server", async () => {
    const response = await handleCreateLink(link(hendri, "404"), hendri);
    expect(response.status).toBe(409);
    expect(((await response.json()) as { error: string }).error).toContain("no access");
  });

  test("gives nobody a second Plex account", async () => {
    await handleCreateLink(link(hendri, "2078"), hendri);
    const response = await handleCreateLink(link(hendri, "1"), hendri);
    expect(response.status).toBe(409);
  });

  test("never gives one account to two people", async () => {
    await handleCreateLink(link(hendri, "2078"), hendri);
    const response = await handleCreateLink(link(adminId, "2078"), adminId);
    expect(response.status).toBe(409);
  });
});
