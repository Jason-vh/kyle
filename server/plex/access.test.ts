import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { checkPlexAccess, getPlexAvatar, invalidatePlexAccessCache } from "./access.ts";

const realFetch = globalThis.fetch;

const MACHINE = "78ee2e1158f735ad25c46adae45e886c332d4be8";
const OTHER = "ddb7ef97532d1ac8f33a4cc6e7abd8cfa19c3338";
const OWNER = {
  id: 32278767,
  uuid: "u",
  username: "jasonvh",
  email: "",
  title: "Jason",
  thumb: "",
};

const COLIN_THUMB = "https://plex.tv/users/abc/avatar";

const SHARE_LIST = `<MediaContainer>
  <User id="211227001" title="Colin" username="colin.va6" thumb="${COLIN_THUMB}">
    <Server id="101" machineIdentifier="${MACHINE}" pending="0"/>
  </User>
  <User id="248153810" title="joshua.ci" username="joshua.ci">
    <Server id="102" machineIdentifier="${MACHINE}" pending="0"/>
  </User>
  <User id="535008446" title="Victor" username="">
    <Server id="103" machineIdentifier="${MACHINE}" pending="0"/>
  </User>
  <User id="999" title="Pending Pete" username="pete" thumb="https://plex.tv/users/pete/avatar">
    <Server id="104" machineIdentifier="${MACHINE}" pending="1"/>
  </User>
  <User id="888" title="Other Server Olly" username="olly">
    <Server id="105" machineIdentifier="${OTHER}" pending="0"/>
  </User>
</MediaContainer>`;

/** Serves the three upstream calls the access cache makes. */
function stubPlex(overrides: { shareListStatus?: number; ownerThumb?: string } = {}) {
  const calls: string[] = [];
  globalThis.fetch = ((url: string) => {
    calls.push(url);
    if (url.endsWith("/identity")) {
      return Promise.resolve(Response.json({ MediaContainer: { machineIdentifier: MACHINE } }));
    }
    if (url.endsWith("/v2/user")) {
      return Promise.resolve(Response.json({ ...OWNER, thumb: overrides.ownerThumb ?? "" }));
    }
    if (url.endsWith("/users")) {
      return Promise.resolve(
        new Response(SHARE_LIST, { status: overrides.shareListStatus ?? 200 }),
      );
    }
    return Promise.resolve(new Response("unexpected", { status: 500 }));
  }) as unknown as typeof fetch;
  return calls;
}

beforeEach(() => {
  process.env.PLEX_CLIENT_IDENTIFIER = "kyle-test";
  process.env.PLEX_SERVER_URL = "http://plex.test:32400";
  process.env.PLEX_SERVER_TOKEN = "owner-token";
  invalidatePlexAccessCache();
});

afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.PLEX_CLIENT_IDENTIFIER;
  delete process.env.PLEX_SERVER_URL;
  delete process.env.PLEX_SERVER_TOKEN;
  invalidatePlexAccessCache();
});

describe("checkPlexAccess", () => {
  test("admits someone the server is shared with", async () => {
    stubPlex();

    expect(await checkPlexAccess("211227001")).toEqual({
      allowed: true,
      isOwner: false,
      displayName: "Colin",
    });
  });

  test("admits a shared user who has never watched anything", async () => {
    stubPlex();

    expect((await checkPlexAccess("248153810")).allowed).toBe(true);
  });

  test("marks the server owner as an admin", async () => {
    stubPlex();

    expect(await checkPlexAccess("32278767")).toEqual({
      allowed: true,
      isOwner: true,
      displayName: "Jason",
    });
  });

  test("refuses a managed user, who has no Plex account to sign in with", async () => {
    stubPlex();

    expect((await checkPlexAccess("535008446")).allowed).toBe(false);
  });

  test("refuses a share the user has not accepted", async () => {
    stubPlex();

    expect((await checkPlexAccess("999")).allowed).toBe(false);
  });

  test("refuses someone shared on a different server", async () => {
    stubPlex();

    expect((await checkPlexAccess("888")).allowed).toBe(false);
  });

  test("refuses a stranger", async () => {
    stubPlex();

    expect((await checkPlexAccess("123")).allowed).toBe(false);
  });

  test("fails closed when plex.tv cannot be reached", async () => {
    stubPlex({ shareListStatus: 500 });

    expect((await checkPlexAccess("211227001")).allowed).toBe(false);
  });

  test("refuses everyone when the server is not configured", async () => {
    stubPlex();
    delete process.env.PLEX_SERVER_TOKEN;

    expect((await checkPlexAccess("211227001")).allowed).toBe(false);
  });

  test("caches the lookup across calls", async () => {
    const calls = stubPlex();

    await checkPlexAccess("211227001");
    await checkPlexAccess("248153810");

    expect(calls.filter((u) => u.endsWith("/users"))).toHaveLength(1);
  });
});

describe("getPlexAvatar", () => {
  test("gives the picture Plex holds for a member", async () => {
    stubPlex();

    expect(await getPlexAvatar("211227001")).toBe(COLIN_THUMB);
  });

  test("gives the owner their own picture, which no share list names", async () => {
    stubPlex({ ownerThumb: "https://plex.tv/users/owner/avatar" });

    expect(await getPlexAvatar(String(OWNER.id))).toBe("https://plex.tv/users/owner/avatar");
  });

  // An empty thumb is Plex saying there is no picture, not a picture at "".
  test("has none for a member Plex holds no picture for", async () => {
    stubPlex();

    expect(await getPlexAvatar("248153810")).toBeUndefined();
  });

  test("has none for an owner who has set no picture", async () => {
    stubPlex();

    expect(await getPlexAvatar(String(OWNER.id))).toBeUndefined();
  });

  test("has none for someone the server is not shared with", async () => {
    stubPlex();

    expect(await getPlexAvatar("123")).toBeUndefined();
  });

  test("has none for an invitation not yet taken up", async () => {
    stubPlex();

    expect(await getPlexAvatar("999")).toBeUndefined();
  });

  test("has none when plex.tv cannot be reached", async () => {
    stubPlex({ shareListStatus: 500 });

    expect(await getPlexAvatar("211227001")).toBeUndefined();
  });

  test("has none when the server is not configured", async () => {
    stubPlex();
    delete process.env.PLEX_SERVER_TOKEN;

    expect(await getPlexAvatar("211227001")).toBeUndefined();
  });
});
