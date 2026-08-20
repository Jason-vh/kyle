import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { checkPlexAccess, invalidatePlexAccessCache } from "./access.ts";

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

const SHARE_LIST = `<MediaContainer>
  <User id="211227001" title="Colin" username="colin.va6">
    <Server machineIdentifier="${MACHINE}" pending="0"/>
  </User>
  <User id="248153810" title="joshua.ci" username="joshua.ci">
    <Server machineIdentifier="${MACHINE}" pending="0"/>
  </User>
  <User id="535008446" title="Victor" username="">
    <Server machineIdentifier="${MACHINE}" pending="0"/>
  </User>
  <User id="999" title="Pending Pete" username="pete">
    <Server machineIdentifier="${MACHINE}" pending="1"/>
  </User>
  <User id="888" title="Other Server Olly" username="olly">
    <Server machineIdentifier="${OTHER}" pending="0"/>
  </User>
</MediaContainer>`;

/** Serves the three upstream calls the access cache makes. */
function stubPlex(overrides: { shareListStatus?: number } = {}) {
  const calls: string[] = [];
  globalThis.fetch = ((url: string) => {
    calls.push(url);
    if (url.endsWith("/identity")) {
      return Promise.resolve(Response.json({ MediaContainer: { machineIdentifier: MACHINE } }));
    }
    if (url.endsWith("/v2/user")) return Promise.resolve(Response.json(OWNER));
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
