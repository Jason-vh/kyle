import { afterEach, beforeEach, expect, test } from "bun:test";
import { handleChat } from "./chat.ts";
import { checkWebhookAuth } from "#server/webhooks/auth.ts";

const names = ["NODE_ENV", "CHAT_API_KEY", "CHAT_USER_ID", "WEBHOOK_AUTH"] as const;
let saved: Partial<Record<(typeof names)[number], string>>;
beforeEach(() => {
  saved = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  for (const name of names) delete process.env[name];
});
afterEach(() => {
  for (const name of names) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
});

function request(host = "kyle.test", authorization?: string) {
  return new Request(`http://${host}/chat`, {
    method: "POST",
    headers: authorization ? { authorization } : {},
    body: "{}",
  });
}

test("missing service secrets fail closed by default, including localhost", async () => {
  for (const host of ["kyle.test", "localhost"]) {
    expect((await handleChat(request(host))).status).toBe(503);
    expect(checkWebhookAuth(request(host))?.status).toBe(503);
  }
});

test("only explicit local development permits missing secrets", async () => {
  process.env.NODE_ENV = "development";
  expect(checkWebhookAuth(request("localhost"))).toBeNull();
  expect((await handleChat(request("localhost"))).status).toBe(403);
  expect(checkWebhookAuth(request())?.status).toBe(503);
  expect((await handleChat(request())).status).toBe(503);
});

test("configured secrets are enforced even in development", async () => {
  process.env.NODE_ENV = "development";
  process.env.CHAT_API_KEY = "test-key";
  process.env.WEBHOOK_AUTH = "user:password";
  expect((await handleChat(request("localhost"))).status).toBe(401);
  expect((await handleChat(request("localhost", "Bearer wrong"))).status).toBe(401);
  expect(checkWebhookAuth(request("localhost"))?.status).toBe(401);
  expect(checkWebhookAuth(request("localhost", `Basic ${btoa("user:password")}`))).toBeNull();
});
