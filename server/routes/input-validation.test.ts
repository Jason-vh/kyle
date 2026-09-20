import { afterAll, beforeAll, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { createTestUser, deleteTestUser } from "#server/db/testing.ts";
import { signJwt } from "#server/auth/jwt.ts";
import { handlePasskeyLoginVerify, handlePasskeyRegisterVerify } from "./api/auth-passkey.ts";
import { handleCreateLink } from "./api/users.ts";
import { handleCreatePlexInvite } from "./api/plex-members.ts";
import { handleRetryRequest } from "./api/requests.ts";
import { handleChat } from "./chat.ts";
import { handleSlackEvents } from "./slack-events.ts";
import { handleRadarrWebhook, handleSonarrWebhook } from "#server/webhooks/handler.ts";

const names = [
  "CHAT_API_KEY",
  "CHAT_USER_ID",
  "PLEX_SERVER_URL",
  "PLEX_SERVER_TOKEN",
  "WEBHOOK_AUTH",
  "SLACK_SIGNING_SECRET",
] as const;
const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
let userId: string;
let cookie: string;

beforeAll(async () => {
  process.env.JWT_SECRET ??= "test-only-secret";
  userId = await createTestUser("Validation", true);
  cookie = `kyle_auth=${await signJwt({ id: userId, name: "Validation", admin: true })}`;
  Object.assign(process.env, {
    CHAT_API_KEY: "input-test",
    CHAT_USER_ID: userId,
    PLEX_SERVER_URL: "http://plex.test",
    PLEX_SERVER_TOKEN: "input-test",
    WEBHOOK_AUTH: "user:password",
    SLACK_SIGNING_SECRET: "input-test",
  });
});

afterAll(async () => {
  await deleteTestUser(userId);
  for (const name of names) {
    if (previous[name] === undefined) delete process.env[name];
    else process.env[name] = previous[name];
  }
});

function request(body: unknown, authorization = "Bearer input-test") {
  return new Request("http://localhost/test", {
    method: "POST",
    headers: { cookie, authorization },
    body: JSON.stringify(body),
  });
}

test.each([null, [], 1, "input", true].map((body) => ({ body })))(
  "rejects non-object API inputs: %s",
  async ({ body }) => {
    const handlers = [
      handlePasskeyLoginVerify,
      handlePasskeyRegisterVerify,
      handleCreatePlexInvite,
      handleChat,
      (req: Request) => handleCreateLink(req, userId),
    ];
    for (const handler of handlers) {
      expect((await handler(request(body))).status).toBe(400);
    }
  },
);

test("rejects bad conversation and platform identifiers before querying them", async () => {
  expect((await handleChat(request({ message: "hello", conversationId: [] }))).status).toBe(400);
  expect(
    (await handleCreateLink(request({ platform: "slack", platformUserId: 123 }), userId)).status,
  ).toBe(400);
});

test.each(["", "-1", "NaN", "invalid", "1.5"])(
  "rejects invalid retry seasons rather than widening to the whole title: %s",
  async (season) => {
    const req = new Request(`http://localhost/api/requests/series/1/retry?season=${season}`, {
      headers: { cookie },
    });
    expect((await handleRetryRequest(req, "series", "1")).status).toBe(400);
  },
);

test.each(
  [
    null,
    [],
    {},
    { eventType: "Download" },
    { eventType: "Download", movie: {}, series: {}, episodes: [] },
  ].map((body) => ({ body })),
)("rejects malformed downloads without enqueuing them: %s", async ({ body }) => {
  const authorization = `Basic ${btoa("user:password")}`;
  expect((await handleRadarrWebhook(request(body, authorization))).status).toBe(400);
  expect((await handleSonarrWebhook(request(body, authorization))).status).toBe(400);
});

test.each(
  [
    null,
    [],
    { type: "url_verification", challenge: 1 },
    { type: "event_callback", event: { type: "message", channel: "C1", ts: "1", text: {} } },
    { type: "event_callback", event: { type: "message", channel: "C1", ts: "1", files: [null] } },
  ].map((payload) => ({ payload })),
)("rejects malformed signed Slack payloads: %s", async ({ payload }) => {
  const body = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", "input-test")
    .update(`v0:${timestamp}:${body}`)
    .digest("hex");
  const req = new Request("http://localhost/slack/events", {
    method: "POST",
    headers: { "x-slack-request-timestamp": timestamp, "x-slack-signature": `v0=${signature}` },
    body,
  });
  expect((await handleSlackEvents(req)).status).toBe(400);
});
