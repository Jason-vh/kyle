import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { handleDeleteUser, handleGetUsers, handleMergeUsers, handleRenameUser } from "./users.ts";
import { buildJwtCookie, signJwt } from "#server/auth/jwt.ts";
import { createTestUser, deleteTestUser } from "#server/db/testing.ts";
import { db } from "#server/db/index.ts";
import { mediaRequests, users } from "#server/db/schema.ts";
import type { AdminUser } from "#shared/types.ts";

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

    const response = await handleGetUsers(request("/api/users", "GET", asAdmin));
    const { users: people } = (await response.json()) as { users: AdminUser[] };
    const member = people.find((person) => person.id === memberId);

    expect(member?.footprint.requests).toBe(1);
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
});
