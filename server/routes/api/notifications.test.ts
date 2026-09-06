import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";

process.env.JWT_SECRET = "test-secret-that-is-long-enough-for-hs256";

const marked: { userId: string; ids?: string[] }[] = [];

const realDb = await import("#server/db/notifications.ts");
mock.module("#server/db/notifications.ts", () => ({
  ...realDb,
  listNotifications: (userId: string) =>
    Promise.resolve([
      {
        id: "n1",
        mediaType: "movie",
        title: "Inception (2010)",
        body: "It is ready to watch.",
        read: false,
        createdAt: new Date().toISOString(),
        userId,
      },
    ]),
  countUnread: () => Promise.resolve(1),
  markRead: (userId: string, ids?: string[]) => {
    marked.push({ userId, ids });
    return Promise.resolve(ids?.length ?? 1);
  },
}));

const { handleGetNotifications, handleMarkNotificationsRead } =
  await import("#server/routes/api/notifications.ts");
const { signJwt, buildJwtCookie } = await import("#server/auth/jwt.ts");

let asUser = "";

beforeAll(async () => {
  asUser = buildJwtCookie(await signJwt({ id: "u1", name: "Jane", admin: false }), true).split(
    ";",
  )[0]!;
});

afterEach(() => {
  marked.length = 0;
});

function request(path: string, method: string, cookie?: string, body?: string): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: cookie ? { Cookie: cookie, "Content-Type": "application/json" } : {},
    body,
  });
}

describe("GET /api/notifications", () => {
  test("a signed-out visitor is refused", async () => {
    expect((await handleGetNotifications(request("/api/notifications", "GET"))).status).toBe(401);
  });

  test("reports what there is and how much is unread", async () => {
    const res = await handleGetNotifications(request("/api/notifications", "GET", asUser));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { notifications: unknown[]; unread: number };
    expect(body.notifications).toHaveLength(1);
    expect(body.unread).toBe(1);
  });
});

describe("POST /api/notifications/read", () => {
  const read = (cookie?: string, body?: string) =>
    handleMarkNotificationsRead(request("/api/notifications/read", "POST", cookie, body));

  test("a signed-out visitor is refused", async () => {
    expect((await read()).status).toBe(401);
    expect(marked).toEqual([]);
  });

  // The bell has no per-item control, so an empty body means all of them.
  test("an empty body marks everything read", async () => {
    expect((await read(asUser, "{}")).status).toBe(200);
    expect(marked).toEqual([{ userId: "u1", ids: undefined }]);
  });

  test("a body with no ids at all is still the whole lot", async () => {
    await read(asUser);
    expect(marked).toEqual([{ userId: "u1", ids: undefined }]);
  });

  test("named ids mark only those", async () => {
    await read(asUser, JSON.stringify({ ids: ["n1", "n2"] }));
    expect(marked).toEqual([{ userId: "u1", ids: ["n1", "n2"] }]);
  });

  // Nothing stops a caller sending rubbish; it must not reach the query.
  test("ids that are not strings are dropped", async () => {
    await read(asUser, JSON.stringify({ ids: ["n1", 7, null] }));
    expect(marked).toEqual([{ userId: "u1", ids: ["n1"] }]);
  });

  test("someone else's ids are still scoped to the caller", async () => {
    await read(asUser, JSON.stringify({ ids: ["someone-elses"] }));
    expect(marked[0]?.userId).toBe("u1");
  });
});
