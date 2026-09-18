import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { invalidatePlexAccessCache, checkPlexAccess } from "./access.ts";
import {
  invitePlexMember,
  listPlexMembers,
  PlexRefusedError,
  removePlexMember,
  type PlexMember,
} from "./members.ts";

// No mocks: the real calls run, with plex.tv and the server stubbed at the
// network, so the XML and the request bodies are the ones Plex would see.

const MACHINE = "78ee2e1158f735ad25c46adae45e886c332d4be8";
const OTHER = "ddb7ef97532d1ac8f33a4cc6e7abd8cfa19c3338";

const OWNER = {
  id: 32278767,
  uuid: "u",
  username: "jasonvh",
  email: "jason@vanhattum.test",
  title: "Jason",
  thumb: "https://plex.test/jason",
};

const SHARE_LIST = `<MediaContainer>
  <User id="211227001" title="Colin" username="colin.va6" email="colin@plex.test" thumb="https://plex.test/colin">
    <Server id="501" machineIdentifier="${MACHINE}" pending="0"/>
  </User>
  <User id="999" title="Pending Pete" username="pete" email="pete@plex.test">
    <Server id="502" machineIdentifier="${MACHINE}" pending="1"/>
  </User>
  <User id="888" title="Olly" username="olly" email="olly@plex.test">
    <Server id="503" machineIdentifier="${OTHER}" pending="0"/>
  </User>
</MediaContainer>`;

// An invitation is filed under the address it was sent to, and someone with no
// Plex account has nothing else to be known by.
const SENT_INVITES = `<MediaContainer>
  <Invite id="pete@plex.test" email="pete@plex.test" username="pete" friendlyName="Pending Pete" server="1"/>
  <Invite id="nobody@plex.test" email="nobody@plex.test" username="" friendlyName="" server="1"/>
  <Invite id="justafriend@plex.test" email="justafriend@plex.test" username="friend" server="0"/>
</MediaContainer>`;

const SERVERS = `<MediaContainer>
  <Server machineIdentifier="${OTHER}">
    <Section id="99" key="1" type="movie" title="Old Movies"/>
  </Server>
  <Server machineIdentifier="${MACHINE}">
    <Section id="134763213" key="1" type="movie" title="Movies"/>
    <Section id="134763215" key="2" type="show" title="TV Shows"/>
  </Server>
</MediaContainer>`;

interface Call {
  method: string;
  url: string;
  body?: unknown;
}

let calls: Call[] = [];

const realFetch = globalThis.fetch;

/** Serves plex.tv and the server itself, failing anything unforeseen. */
function stubPlex(refusal?: { status: number; message: string }) {
  globalThis.fetch = ((url: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ method, url, body });

    if (url.endsWith("/identity")) {
      return Promise.resolve(Response.json({ MediaContainer: { machineIdentifier: MACHINE } }));
    }
    if (url.endsWith("/v2/user")) return Promise.resolve(Response.json(OWNER));
    if (url.endsWith("/api/users")) return Promise.resolve(new Response(SHARE_LIST));
    if (url.endsWith("/invites/requested")) return Promise.resolve(new Response(SENT_INVITES));
    if (url.includes("/api/servers/") && method === "GET") {
      return Promise.resolve(new Response(SERVERS));
    }
    if (url.endsWith("/v2/shared_servers") && method === "POST") {
      if (refusal) {
        return Promise.resolve(
          Response.json(
            { errors: [{ code: 1123, message: refusal.message }] },
            {
              status: refusal.status,
            },
          ),
        );
      }
      return Promise.resolve(Response.json({ id: 700 }));
    }
    if (method === "DELETE") return Promise.resolve(new Response(""));

    return Promise.resolve(new Response("unexpected", { status: 500 }));
  }) as unknown as typeof fetch;
}

const member = (handle: string): PlexMember => ({
  handle,
  name: "Someone",
  email: "someone@plex.test",
  thumb: "",
  status: "member",
});

beforeEach(() => {
  process.env.PLEX_CLIENT_IDENTIFIER = "kyle-test";
  process.env.PLEX_SERVER_URL = "http://plex.test:32400";
  process.env.PLEX_SERVER_TOKEN = "owner-token";
  calls = [];
  invalidatePlexAccessCache();
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("listPlexMembers", () => {
  test("puts the owner first, then members, then invitations", async () => {
    stubPlex();

    expect(await listPlexMembers()).toEqual([
      {
        handle: "owner",
        name: "Jason",
        email: "jason@vanhattum.test",
        thumb: "https://plex.test/jason",
        status: "owner",
      },
      {
        handle: "share:501",
        name: "Colin",
        email: "colin@plex.test",
        thumb: "https://plex.test/colin",
        status: "member",
      },
      {
        handle: "invite:nobody@plex.test",
        name: "nobody@plex.test",
        email: "nobody@plex.test",
        thumb: "",
        status: "pending",
      },
      {
        handle: "share:502",
        name: "Pending Pete",
        email: "pete@plex.test",
        thumb: "",
        status: "pending",
      },
    ]);
  });

  test("leaves out anyone shared on another of the owner's servers", async () => {
    stubPlex();

    expect((await listPlexMembers()).map((m) => m.email)).not.toContain("olly@plex.test");
  });

  test("counts an invitation once, however many ways Plex reports it", async () => {
    stubPlex();

    const pete = (await listPlexMembers()).filter((m) => m.email === "pete@plex.test");

    expect(pete).toHaveLength(1);
    expect(pete[0]!.handle).toBe("share:502");
  });
});

describe("invitePlexMember", () => {
  test("shares every library on the configured server", async () => {
    stubPlex();

    await invitePlexMember("new@plex.test");

    const invite = calls.find((call) => call.method === "POST")!;
    expect(invite.url).toBe("https://plex.tv/api/v2/shared_servers");
    expect(invite.body).toEqual({
      machineIdentifier: MACHINE,
      invitedEmail: "new@plex.test",
      librarySectionIds: [134763213, 134763215],
      settings: {
        allowSync: "1",
        allowCameraUpload: "0",
        allowChannels: "0",
        allowSubtitleAdmin: "0",
      },
      skipFriendship: true,
    });
  });

  test("shares the server without making the owner friends with them", async () => {
    stubPlex();

    await invitePlexMember("new@plex.test");

    const invite = calls.find((call) => call.method === "POST")!;
    expect((invite.body as { skipFriendship: boolean }).skipFriendship).toBe(true);
  });

  test("passes on what Plex says when it refuses", async () => {
    stubPlex({ status: 422, message: "You cannot send an invitation to yourself." });

    expect(invitePlexMember("jason@vanhattum.test")).rejects.toThrow(
      new PlexRefusedError("You cannot send an invitation to yourself."),
    );
  });

  test("keeps a server failure a failure", async () => {
    stubPlex({ status: 503, message: "upstream is down" });

    expect(invitePlexMember("new@plex.test")).rejects.toThrow(/503/);
  });

  test("lets the newcomer sign in without waiting for the access cache", async () => {
    stubPlex();
    await checkPlexAccess("211227001");
    calls = [];

    await invitePlexMember("new@plex.test");
    await checkPlexAccess("211227001");

    expect(calls.some((call) => call.url.endsWith("/api/users"))).toBe(true);
  });
});

describe("removePlexMember", () => {
  test("ends a share by the share", async () => {
    stubPlex();

    await removePlexMember(member("share:501"));

    expect(calls).toContainEqual({
      method: "DELETE",
      url: `https://plex.tv/api/servers/${MACHINE}/shared_servers/501`,
      body: undefined,
    });
  });

  test("withdraws an invitation that has no share behind it", async () => {
    stubPlex();

    await removePlexMember(member("invite:nobody@plex.test"));

    expect(calls).toContainEqual({
      method: "DELETE",
      url: "https://plex.tv/api/invites/requested/nobody%40plex.test?friend=0&home=0&server=1",
      body: undefined,
    });
  });

  test("refuses anything that is not a share or an invitation", async () => {
    stubPlex();

    expect(removePlexMember(member("owner"))).rejects.toThrow(PlexRefusedError);
    expect(calls).toEqual([]);
  });
});
