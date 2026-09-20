import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { handleApiThreadDetail, handleApiThreadList } from "./threads.ts";
import { buildJwtCookie, signJwt } from "#server/auth/jwt.ts";
import { createTestUser, deleteTestUser } from "#server/db/testing.ts";

// Conversations are everyone's private words to Kyle, so the route itself is
// the thing under test rather than what it returns.

process.env.JWT_SECRET = "test-secret-that-is-long-enough-for-hs256";

const THREAD_ID = "00000000-0000-4000-8000-000000000000";

let userId = "";
let adminId = "";
let asUser = "";
let asAdmin = "";

beforeAll(async () => {
  userId = await createTestUser("Threads Route");
  adminId = await createTestUser("Threads Admin", true);
  asUser = buildJwtCookie(await signJwt({ id: userId, name: "Jane", admin: false }), true).split(
    ";",
  )[0]!;
  asAdmin = buildJwtCookie(await signJwt({ id: adminId, name: "Sam", admin: true }), true).split(
    ";",
  )[0]!;
});

afterAll(async () => {
  await deleteTestUser(userId);
  await deleteTestUser(adminId);
});

function request(path: string, cookie?: string): Request {
  return new Request(`http://localhost${path}`, { headers: cookie ? { Cookie: cookie } : {} });
}

describe("GET /api/threads", () => {
  test("a signed-out visitor is refused", async () => {
    expect((await handleApiThreadList(request("/api/threads"))).status).toBe(401);
  });

  test("someone signed in but not an admin is refused", async () => {
    expect((await handleApiThreadList(request("/api/threads", asUser))).status).toBe(403);
  });

  test("an admin may read the list", async () => {
    expect((await handleApiThreadList(request("/api/threads", asAdmin))).status).toBe(200);
  });
});

describe("GET /api/threads/:id", () => {
  const detail = (query = "", cookie?: string) =>
    handleApiThreadDetail(request(`/api/threads/${THREAD_ID}${query}`, cookie), THREAD_ID);

  test("a signed-out visitor is refused", async () => {
    expect((await detail()).status).toBe(401);
  });

  test("someone signed in but not an admin is refused", async () => {
    expect((await detail("", asUser)).status).toBe(403);
  });

  // Sharing by signed link is gone; the parameter must not be a way back in.
  test("a ?sig= link no longer opens anything", async () => {
    expect((await detail("?sig=any-signature-at-all")).status).toBe(401);
  });

  test("an admin reads the thread itself", async () => {
    // 404 rather than 403: allowed in, the thread simply is not there.
    expect((await detail("", asAdmin)).status).toBe(404);
  });
});
