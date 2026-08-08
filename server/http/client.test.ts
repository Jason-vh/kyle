import { describe, expect, test, afterEach } from "bun:test";
import { ApiError, createApiClient } from "./client.ts";

const realFetch = globalThis.fetch;

function stubFetch(handler: (url: string, init: RequestInit) => Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = ((url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    return Promise.resolve(handler(url, init));
  }) as unknown as typeof fetch;
  return calls;
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

const config = () => ({ baseUrl: "https://api.test/v1", headers: { "X-Api-Key": "secret" } });

describe("createApiClient", () => {
  test("sends configured headers and parses JSON", async () => {
    const calls = stubFetch(() => Response.json({ id: 7 }));
    const request = createApiClient({ service: "test", config });

    expect(await request<{ id: number }>("/thing")).toEqual({ id: 7 });
    expect(calls[0]!.url).toBe("https://api.test/v1/thing");
    expect((calls[0]!.init.headers as Record<string, string>)["X-Api-Key"]).toBe("secret");
  });

  test("resolves an empty body as undefined", async () => {
    stubFetch(() => new Response(""));
    const request = createApiClient({ service: "test", config });

    expect(await request("/delete")).toBeUndefined();
  });

  test("throws ApiError carrying the parsed error body", async () => {
    stubFetch(() => Response.json({ message: "nope" }, { status: 422 }));
    const request = createApiClient({ service: "test", config });

    const error = (await request("/thing").catch((e) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(422);
    expect(error.body).toEqual({ message: "nope" });
  });

  test("re-authenticates once when the session is rejected", async () => {
    let authenticated = false;
    const calls = stubFetch(() =>
      authenticated ? Response.json({ ok: true }) : new Response("", { status: 403 }),
    );
    const request = createApiClient({
      service: "test",
      config,
      authenticate: async (force) => {
        if (force) authenticated = true;
      },
      isAuthFailure: (response) => response.status === 403,
    });

    expect(await request<{ ok: boolean }>("/thing")).toEqual({ ok: true });
    expect(calls).toHaveLength(2);
  });

  test("surfaces the failure when re-authentication does not help", async () => {
    stubFetch(() => new Response("denied", { status: 403 }));
    const request = createApiClient({
      service: "test",
      config,
      authenticate: async () => {},
      isAuthFailure: (response) => response.status === 403,
    });

    expect(request("/thing")).rejects.toThrow(ApiError);
  });
});
