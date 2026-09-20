import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { handleApiThreadDetail, handleApiThreadList } from "./threads.ts";
import { buildJwtCookie, signJwt } from "#server/auth/jwt.ts";
import { signThreadSig } from "#server/routes/threads-auth.ts";
import { createTestUser, deleteTestUser } from "#server/db/testing.ts";

// Conversations are everyone's private words to Kyle, so the route itself is
// the thing under test rather than what it returns.

process.env.JWT_SECRET = "test-secret-that-is-long-enough-for-hs256";
process.env.THREAD_VIEWER_TOKEN = "test-thread-viewer-token";

const THREAD_ID = "00000000-0000-4000-8000-000000000000";

let userId = "";
let adminId = "";
let asUser = "";
let asAdmin = "";

beforeAll(async () => {
  userId = await createTestUser("Threads Route");
  adminId = await createTestUser("Threads Admin");
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

  // The point of sharing a thread is that whoever holds the link can read it.
  test("a signed link opens the one thread it names, admin or not", async () => {
    const sig = await signThreadSig(THREAD_ID);

    // 404 rather than 403: the link was accepted, the thread simply is not there.
    expect((await detail(`?sig=${sig}`)).status).toBe(404);
  });

  test("a forged signature is refused", async () => {
    expect((await detail("?sig=not-a-real-signature")).status).toBe(403);
  });

  test("a signature for another thread does not open this one", async () => {
    const sig = await signThreadSig("11111111-1111-4111-8111-111111111111");

    expect((await detail(`?sig=${sig}`)).status).toBe(403);
  });
});
