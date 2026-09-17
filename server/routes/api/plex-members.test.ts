import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import {
  handleCreatePlexInvite,
  handleGetPlexMembers,
  handleRemovePlexMember,
} from "./plex-members.ts";
import { buildJwtCookie, signJwt } from "#server/auth/jwt.ts";
import { db } from "#server/db/index.ts";
import { plexInvites } from "#server/db/schema.ts";
import { createTestUser, deleteTestUser } from "#server/db/testing.ts";
import { invalidatePlexAccessCache } from "#server/plex/access.ts";

// No mocks: the real routes run against the real database, with plex.tv and
// the server stubbed at the network.

process.env.JWT_SECRET = "test-secret-that-is-long-enough-for-hs256";
process.env.PLEX_CLIENT_IDENTIFIER = "kyle-test";
process.env.PLEX_SERVER_URL = "http://plex.test:32400";
process.env.PLEX_SERVER_TOKEN = "owner-token";

const MACHINE = "78ee2e1158f735ad25c46adae45e886c332d4be8";

const OWNER = {
  id: 32278767,
  uuid: "u",
  username: "jasonvh",
  email: "jason@vanhattum.test",
  title: "Jason",
  thumb: "",
};

const SHARE_LIST = `<MediaContainer>
  <User id="211227001" title="Colin" username="colin.va6" email="colin@plex.test">
    <Server id="501" machineIdentifier="${MACHINE}" pending="0"/>
  </User>
  <User id="999" title="Pete" username="pete" email="pete@plex.test">
    <Server id="502" machineIdentifier="${MACHINE}" pending="1"/>
  </User>
</MediaContainer>`;

const SERVERS = `<MediaContainer>
  <Server machineIdentifier="${MACHINE}">
    <Section id="134763213" key="1" type="movie" title="Movies"/>
  </Server>
</MediaContainer>`;

const realFetch = globalThis.fetch;

let deletes: string[] = [];
let posts: unknown[] = [];

function stubPlex(options: { sentInvites?: string; refusal?: string } = {}) {
  globalThis.fetch = ((url: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";

    if (url.endsWith("/identity")) {
      return Promise.resolve(Response.json({ MediaContainer: { machineIdentifier: MACHINE } }));
    }
    if (url.endsWith("/v2/user")) return Promise.resolve(Response.json(OWNER));
    if (url.endsWith("/api/users")) return Promise.resolve(new Response(SHARE_LIST));
    if (url.endsWith("/invites/requested") && method === "GET") {
      return Promise.resolve(new Response(options.sentInvites ?? "<MediaContainer/>"));
    }
    if (url.includes("/api/servers/") && method === "GET") {
      return Promise.resolve(new Response(SERVERS));
    }
    if (url.endsWith("/v2/shared_servers") && method === "POST") {
      posts.push(JSON.parse(String(init.body)));
      if (options.refusal) {
        return Promise.resolve(
          Response.json({ errors: [{ code: 1123, message: options.refusal }] }, { status: 422 }),
        );
      }
      return Promise.resolve(Response.json({ id: 700 }));
    }
    if (method === "DELETE") {
      deletes.push(url);
      return Promise.resolve(new Response(""));
    }

    return Promise.resolve(new Response("unexpected", { status: 500 }));
  }) as unknown as typeof fetch;
}

let memberId = "";
let otherId = "";
let adminId = "";
let asMember = "";
let asOther = "";
let asAdmin = "";

async function cookieFor(id: string, name: string, admin: boolean): Promise<string> {
  const token = await signJwt({ id, name, admin });
  return buildJwtCookie(token, true).split(";")[0]!;
}

beforeAll(async () => {
  memberId = await createTestUser("Member");
  otherId = await createTestUser("Other");
  adminId = await createTestUser("Admin");
  asMember = await cookieFor(memberId, "Member", false);
  asOther = await cookieFor(otherId, "Other", false);
  asAdmin = await cookieFor(adminId, "Admin", true);
});

afterAll(async () => {
  await db.delete(plexInvites).where(eq(plexInvites.invitedByUserId, memberId));
  await deleteTestUser(memberId);
  await deleteTestUser(otherId);
  await deleteTestUser(adminId);
});

beforeEach(() => {
  deletes = [];
  posts = [];
  invalidatePlexAccessCache();
});

afterEach(async () => {
  globalThis.fetch = realFetch;
  await db.delete(plexInvites);
});

const get = (cookie?: string) =>
  new Request("http://localhost/api/plex/members", {
    headers: cookie ? { Cookie: cookie } : {},
  });

const post = (body: unknown, cookie?: string) =>
  new Request("http://localhost/api/plex/invites", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });

const remove = (handle: string, cookie?: string) =>
  new Request(`http://localhost/api/plex/members/${handle}`, {
    method: "DELETE",
    headers: cookie ? { Cookie: cookie } : {},
  });

interface MembersBody {
  members: {
    id: string;
    name: string;
    status: string;
    email?: string;
    invitedBy?: string;
    canRemove: boolean;
  }[];
}

async function members(cookie: string): Promise<MembersBody["members"]> {
  const body = (await (await handleGetPlexMembers(get(cookie))).json()) as MembersBody;
  return body.members;
}

async function invite(email: string, cookie: string) {
  return handleCreatePlexInvite(post({ email }, cookie));
}

/** Invitations plex.tv has on file, each filed under the address it went to. */
function waiting(count: number): string {
  const invites = Array.from(
    { length: count },
    (_, i) => `<Invite id="waiting${i}@plex.test" email="waiting${i}@plex.test" server="1"/>`,
  ).join("");
  return `<MediaContainer>${invites}</MediaContainer>`;
}

describe("GET /api/plex/members", () => {
  test("a signed-out visitor is refused", async () => {
    stubPlex();

    expect((await handleGetPlexMembers(get())).status).toBe(401);
  });

  test("anyone signed in sees who is on the server", async () => {
    stubPlex();

    expect(await members(asMember)).toMatchObject([
      { id: "owner", name: "Jason", status: "owner", canRemove: false },
      { id: "share:501", name: "Colin", status: "member", canRemove: false },
      { id: "share:502", name: "Pete", status: "pending", canRemove: false },
    ]);
  });

  test("an admin may remove anyone but the owner", async () => {
    stubPlex();

    expect((await members(asAdmin)).map((m) => m.canRemove)).toEqual([false, true, true]);
  });

  test("names who invited someone still waiting, and lets them take it back", async () => {
    stubPlex();
    await invite("pete@plex.test", asMember);

    const pete = (await members(asMember)).find((m) => m.id === "share:502")!;

    expect(pete.invitedBy).toStartWith("Member");
    expect(pete.canRemove).toBe(true);
    expect(pete.email).toBe("pete@plex.test");
  });

  test("keeps an address from everyone but the admin and whoever typed it", async () => {
    stubPlex();
    await invite("pete@plex.test", asMember);

    const asSeenByOther = (await members(asOther)).find((m) => m.id === "share:502")!;

    expect(asSeenByOther.email).toBeUndefined();
    expect(asSeenByOther.canRemove).toBe(false);
    expect(asSeenByOther.invitedBy).toStartWith("Member");
  });

  test("an unreachable Plex is a bad gateway, not an empty list", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(new Response("down", { status: 500 }))) as unknown as typeof fetch;

    expect((await handleGetPlexMembers(get(asMember))).status).toBe(502);
  });
});

describe("POST /api/plex/invites", () => {
  test("a signed-out visitor is refused, and Plex is never called", async () => {
    stubPlex();

    expect((await handleCreatePlexInvite(post({ email: "new@plex.test" }))).status).toBe(401);
    expect(posts).toEqual([]);
  });

  test("anyone signed in may invite, and is recorded as having done so", async () => {
    stubPlex();

    const res = await invite("New@Plex.test", asMember);

    expect(res.status).toBe(200);
    expect(posts).toMatchObject([{ invitedEmail: "New@Plex.test" }]);
    expect(await db.select().from(plexInvites)).toMatchObject([
      { email: "new@plex.test", invitedByUserId: memberId },
    ]);
  });

  test("an address left blank is refused before Plex hears about it", async () => {
    stubPlex();

    const res = await handleCreatePlexInvite(post({ email: "   " }, asMember));

    expect(res.status).toBe(400);
    expect(posts).toEqual([]);
  });

  test("passes on Plex's own words when it refuses", async () => {
    stubPlex({ refusal: "You cannot send an invitation to yourself." });

    const res = await invite("jason@vanhattum.test", asMember);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "You cannot send an invitation to yourself." });
    expect(await db.select().from(plexInvites)).toEqual([]);
  });

  test("caps how many invitations one person may have waiting", async () => {
    stubPlex({ sentInvites: waiting(5) });
    for (let i = 0; i < 5; i++) await invite(`waiting${i}@plex.test`, asMember);
    posts = [];

    const res = await invite("onemore@plex.test", asMember);

    expect(res.status).toBe(429);
    expect(posts).toEqual([]);
  });

  test("the cap is on each person, not on the server", async () => {
    stubPlex({ sentInvites: waiting(5) });
    for (let i = 0; i < 5; i++) await invite(`waiting${i}@plex.test`, asMember);

    expect((await invite("onemore@plex.test", asOther)).status).toBe(200);
  });
});

describe("DELETE /api/plex/members/:handle", () => {
  test("a signed-out visitor is refused, and nothing is removed", async () => {
    stubPlex();

    expect((await handleRemovePlexMember(remove("share:501"), "share:501")).status).toBe(401);
    expect(deletes).toEqual([]);
  });

  test("an admin removes a member", async () => {
    stubPlex();

    const res = await handleRemovePlexMember(remove("share:501", asAdmin), "share:501");

    expect(res.status).toBe(200);
    expect(deletes).toEqual([`https://plex.tv/api/servers/${MACHINE}/shared_servers/501`]);
  });

  test("a member may not remove someone who is already watching", async () => {
    stubPlex();

    const res = await handleRemovePlexMember(remove("share:501", asMember), "share:501");

    expect(res.status).toBe(403);
    expect(deletes).toEqual([]);
  });

  test("whoever sent an invitation may take it back", async () => {
    stubPlex();
    await invite("pete@plex.test", asMember);

    const res = await handleRemovePlexMember(remove("share:502", asMember), "share:502");

    expect(res.status).toBe(200);
    expect(deletes).toEqual([`https://plex.tv/api/servers/${MACHINE}/shared_servers/502`]);
  });

  test("somebody else's invitation is not theirs to take back", async () => {
    stubPlex();
    await invite("pete@plex.test", asMember);

    const res = await handleRemovePlexMember(remove("share:502", asOther), "share:502");

    expect(res.status).toBe(403);
    expect(deletes).toEqual([]);
  });

  test("the owner cannot be removed, even by an admin", async () => {
    stubPlex();

    expect((await handleRemovePlexMember(remove("owner", asAdmin), "owner")).status).toBe(403);
    expect(deletes).toEqual([]);
  });

  test("a handle nobody stands behind is a miss", async () => {
    stubPlex();

    expect((await handleRemovePlexMember(remove("share:404", asAdmin), "share:404")).status).toBe(
      404,
    );
    expect(deletes).toEqual([]);
  });
});
