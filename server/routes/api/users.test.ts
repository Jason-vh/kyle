import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import {
  handleDeleteUser,
  handleGetUserProfile,
  handleGetUsers,
  handleMergeUsers,
  handleRenameUser,
} from "./users.ts";
import { buildJwtCookie, signJwt } from "#server/auth/jwt.ts";
import { createTestUser, deleteTestUser } from "#server/db/testing.ts";
import { db } from "#server/db/index.ts";
import { mediaRemovals, mediaRequests, plexInvites, users } from "#server/db/schema.ts";
import type { AdminUser, UserProfile } from "#shared/types.ts";

process.env.JWT_SECRET = "test-secret-that-is-long-enough-for-hs256";

let memberId = "";
let adminId = "";
let asMember = "";
let asAdmin = "";

async function cookieFor(id: string, admin: boolean): Promise<string> {
  return buildJwtCookie(await signJwt({ id, name: "Tester", admin }), true).split(";")[0]!;
}

beforeAll(async () => {
  memberId = await createTestUser("Users Member");
  adminId = await createTestUser("Users Admin", true);
  asMember = await cookieFor(memberId, false);
  asAdmin = await cookieFor(adminId, true);
});

afterAll(async () => {
  await deleteTestUser(memberId);
  await deleteTestUser(adminId);
});

function restore(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function request(path: string, method: string, cookie: string, body?: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("people administration", () => {
  test("is for admins only", async () => {
    expect((await handleGetUsers(request("/api/users", "GET", asMember))).status).toBe(403);
    const merge = request(`/api/users/${adminId}/merge`, "POST", asMember, { from: memberId });
    expect((await handleMergeUsers(merge, adminId)).status).toBe(403);
  });

  test("lists everyone with what they own", async () => {
    await db.insert(mediaRequests).values({
      userId: memberId,
      mediaType: "movie",
      tmdbId: 11,
      title: "Star Wars",
    });

    const realFetch = globalThis.fetch;
    const previous = { radarr: process.env.RADARR_HOST, sonarr: process.env.SONARR_HOST };
    process.env.RADARR_HOST = "http://radarr.test";
    process.env.RADARR_API_KEY ??= "k";
    process.env.SONARR_HOST = "http://sonarr.test";
    process.env.SONARR_API_KEY ??= "k";
    globalThis.fetch = (async (url: string) => {
      if (url.includes("radarr.test")) {
        return Response.json([{ id: 1, tmdbId: 11, title: "Star Wars", sizeOnDisk: 5e9 }]);
      }
      return Response.json([]);
    }) as unknown as typeof fetch;

    const response = await handleGetUsers(request("/api/users", "GET", asAdmin)).finally(() => {
      globalThis.fetch = realFetch;
      restore("RADARR_HOST", previous.radarr);
      restore("SONARR_HOST", previous.sonarr);
    });
    const { users: people } = (await response.json()) as { users: AdminUser[] };
    const member = people.find((person) => person.id === memberId);
    const admin = people.find((person) => person.id === adminId);

    expect(member?.footprint.requests).toBe(1);
    expect(member?.requestedBytes).toBe(5e9);
    expect(admin?.requestedBytes).toBe(0);
  });

  test("renames someone", async () => {
    const rename = request(`/api/users/${memberId}`, "PATCH", asAdmin, { displayName: " Jordan " });
    expect((await handleRenameUser(rename, memberId)).status).toBe(200);

    const [member] = await db.select().from(users).where(eq(users.id, memberId));
    expect(member?.displayName).toBe("Jordan");
  });

  test("merges one person into another", async () => {
    const duplicate = await createTestUser("Duplicate");
    const merge = request(`/api/users/${memberId}/merge`, "POST", asAdmin, { from: duplicate });

    expect((await handleMergeUsers(merge, memberId)).status).toBe(200);
    expect(await db.select().from(users).where(eq(users.id, duplicate))).toEqual([]);
  });

  test("says why a merge was refused", async () => {
    const merge = request(`/api/users/${memberId}/merge`, "POST", asAdmin, { from: memberId });
    const response = await handleMergeUsers(merge, memberId);

    expect(response.status).toBe(409);
    expect(((await response.json()) as { error: string }).error).toContain("themselves");
  });

  test("deletes only someone with nothing to their name, and never yourself", async () => {
    const empty = await createTestUser("Empty");
    expect(
      (await handleDeleteUser(request(`/api/users/${empty}`, "DELETE", asAdmin), empty)).status,
    ).toBe(200);

    const self = request(`/api/users/${adminId}`, "DELETE", asAdmin);
    expect((await handleDeleteUser(self, adminId)).status).toBe(409);

    const busy = request(`/api/users/${memberId}`, "DELETE", asAdmin);
    expect((await handleDeleteUser(busy, memberId)).status).toBe(409);
  });

  test("shows one person in full, naming whatever could not be reached", async () => {
    await db.insert(plexInvites).values({
      invitedByUserId: memberId,
      email: `${crypto.randomUUID()}@example.com`,
    });
    await db.insert(mediaRemovals).values({
      mediaType: "movie",
      tmdbId: 4242,
      title: "Heat",
      removedBy: "Jordan",
      removedByUserId: memberId,
    });

    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response("down", { status: 503 })) as unknown as typeof fetch;
    const response = await handleGetUserProfile(
      request(`/api/users/${memberId}`, "GET", asAdmin),
      memberId,
    ).finally(() => {
      globalThis.fetch = realFetch;
    });
    const profile = (await response.json()) as UserProfile;

    expect(profile.user.id).toBe(memberId);
    expect(profile.requests.map((row) => row.title)).toContain("Star Wars");
    expect(profile.requestsWatched).toEqual({ watched: 0, total: 1 });
    expect(profile.invites).toHaveLength(1);
    expect(profile.removals.map((removal) => removal.title)).toEqual(["Heat"]);
    expect(profile.watching).toBeUndefined();
    expect(profile.unavailable).toEqual(["Radarr", "Sonarr"]);

    await db.delete(plexInvites).where(eq(plexInvites.invitedByUserId, memberId));
    await db.delete(mediaRemovals).where(eq(mediaRemovals.removedByUserId, memberId));
  });

  test("has no page for someone who does not exist", async () => {
    const missing = crypto.randomUUID();
    const response = await handleGetUserProfile(
      request(`/api/users/${missing}`, "GET", asAdmin),
      missing,
    );
    expect(response.status).toBe(404);
  });
});
