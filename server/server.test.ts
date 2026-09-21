import { afterAll, beforeAll, expect, test } from "bun:test";
import { startServer } from "./server.ts";

process.env.JWT_SECRET ??= "test-only-secret";
let server: ReturnType<typeof startServer>;

beforeAll(() => {
  server = startServer(0);
});

afterAll(() => {
  server?.stop(true);
});

function get(path: string, accept: string) {
  return fetch(`http://localhost:${server.port}${path}`, { headers: { accept } });
}

const BROWSER_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";

test.each(["/api/nope", "/api/threads/nope/nope", "/health/nope", "/webhooks/sonarr", "/chat"])(
  "a miss under %s stays a JSON 404 even for a browser",
  async (path) => {
    const response = await get(path, BROWSER_ACCEPT);
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toStartWith("application/json");
    expect(await response.json()).toEqual({ error: "Not found" });
  },
);

test("a missing asset is a miss rather than the app", async () => {
  const response = await get("/assets/gone-a1b2c3.js", "*/*");
  expect(response.status).toBe(404);
  expect(response.headers.get("content-type")).toStartWith("application/json");
});
