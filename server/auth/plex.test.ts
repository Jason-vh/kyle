import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { completePlexAuth, startPlexAuth } from "./plex.ts";

const realFetch = globalThis.fetch;

function stubFetch(handler: (url: string, init: RequestInit) => Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = ((url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    return Promise.resolve(handler(url, init));
  }) as unknown as typeof fetch;
  return calls;
}

const PIN = { id: 42, code: "pincode", authToken: null, expiresAt: "" };
const ACCOUNT = { id: 1, uuid: "plex-uuid", username: "ada", email: "", title: "", thumb: "" };

/** Responds to the PIN create/read and account endpoints in one handler. */
function stubPlex(authToken: string | null) {
  return stubFetch((url) => {
    if (url.endsWith("/pins?strong=true")) return Response.json(PIN);
    if (url.endsWith("/pins/42")) return Response.json({ ...PIN, authToken });
    if (url.endsWith("/user")) return Response.json(ACCOUNT);
    return new Response("unexpected", { status: 500 });
  });
}

function stateOf(authUrl: string): string {
  const forwardUrl = new URLSearchParams(authUrl.split("#?")[1]).get("forwardUrl")!;
  return new URL(forwardUrl).searchParams.get("state")!;
}

beforeEach(() => {
  process.env.PLEX_CLIENT_IDENTIFIER = "kyle-test";
  process.env.PUBLIC_ORIGIN = "https://kyle.test";
});

afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.PLEX_CLIENT_IDENTIFIER;
  delete process.env.PUBLIC_ORIGIN;
});

describe("startPlexAuth", () => {
  test("builds an Auth App URL carrying the PIN code and callback", async () => {
    stubPlex(null);

    const authUrl = await startPlexAuth({ type: "login" });
    const params = new URLSearchParams(authUrl.split("#?")[1]);

    expect(authUrl.startsWith("https://app.plex.tv/auth#?")).toBe(true);
    expect(params.get("clientID")).toBe("kyle-test");
    expect(params.get("code")).toBe("pincode");
    expect(params.get("context[device][product]")).toBe("Kyle");
    expect(params.get("forwardUrl")).toBe(
      `https://kyle.test/api/auth/plex/callback?state=${stateOf(authUrl)}`,
    );
  });

  test("sends the client identifier and product to plex.tv", async () => {
    const calls = stubPlex(null);

    await startPlexAuth({ type: "login" });

    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(calls[0]!.url).toBe("https://plex.tv/api/v2/pins?strong=true");
    expect(headers["X-Plex-Client-Identifier"]).toBe("kyle-test");
    expect(headers["X-Plex-Product"]).toBe("Kyle");
  });
});

describe("completePlexAuth", () => {
  test("returns the intent and account for a claimed PIN", async () => {
    const calls = stubPlex("plex-token");
    const authUrl = await startPlexAuth({ type: "link", userId: "user-1" });

    const result = await completePlexAuth(stateOf(authUrl));

    expect(result).toEqual({
      status: "ok",
      intent: { type: "link", userId: "user-1" },
      account: ACCOUNT,
    });
    const accountCall = calls.find((c) => c.url.endsWith("/user"))!;
    expect((accountCall.init.headers as Record<string, string>)["X-Plex-Token"]).toBe("plex-token");
  });

  test("reports an unclaimed PIN as denied", async () => {
    stubPlex(null);
    const authUrl = await startPlexAuth({ type: "login" });

    expect(await completePlexAuth(stateOf(authUrl))).toEqual({ status: "denied" });
  });

  test("rejects an unknown state", async () => {
    expect(await completePlexAuth("nope")).toEqual({ status: "expired" });
  });

  test("consumes the state so it cannot be replayed", async () => {
    stubPlex("plex-token");
    const authUrl = await startPlexAuth({ type: "login" });
    const state = stateOf(authUrl);

    expect((await completePlexAuth(state)).status).toBe("ok");
    expect(await completePlexAuth(state)).toEqual({ status: "expired" });
  });
});
