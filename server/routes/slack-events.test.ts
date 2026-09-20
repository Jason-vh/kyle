import { afterEach, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db } from "#server/db/index.ts";
import { slackEventJobs } from "#server/db/schema.ts";
import { handleSlackEvents } from "./slack-events.ts";

const originalSecret = process.env.SLACK_SIGNING_SECRET;
const ids: string[] = [];

afterEach(async () => {
  if (originalSecret === undefined) delete process.env.SLACK_SIGNING_SECRET;
  else process.env.SLACK_SIGNING_SECRET = originalSecret;
  if (ids.length)
    await db.delete(slackEventJobs).where(inArray(slackEventJobs.eventId, ids.splice(0)));
});

function request(id: string, retry = false) {
  process.env.SLACK_SIGNING_SECRET = "slack-inbox-test";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify({
    type: "event_callback",
    event_id: id,
    team_id: "T1",
    event: {
      type: "message",
      channel: "C1",
      channel_type: "im",
      user: "U1",
      ts: "1",
      files: [
        { id: "F1", mimetype: "image/png", size: 10_000_000, url_private: "https://unused.test" },
      ],
    },
  });
  const signature = createHmac("sha256", process.env.SLACK_SIGNING_SECRET)
    .update(`v0:${timestamp}:${body}`)
    .digest("hex");
  return new Request("http://localhost/slack/events", {
    method: "POST",
    headers: {
      "x-slack-request-timestamp": timestamp,
      "x-slack-signature": `v0=${signature}`,
      "x-sync-response": "true",
      ...(retry ? { "x-slack-retry-num": "1" } : {}),
    },
    body,
  });
}

test("accepts an unseen Slack retry and persists it before acknowledging", async () => {
  const id = crypto.randomUUID();
  ids.push(id);
  expect((await handleSlackEvents(request(id, true))).status).toBe(200);
  const stored = await db.query.slackEventJobs.findFirst({
    where: eq(slackEventJobs.eventId, id),
  });
  expect(stored).toMatchObject({ eventId: id, teamId: "T1", attempts: 1 });
  expect(stored!.completedAt).not.toBeNull();

  expect((await handleSlackEvents(request(id, true))).status).toBe(200);
  expect(
    (await db.query.slackEventJobs.findFirst({ where: eq(slackEventJobs.eventId, id) }))!.attempts,
  ).toBe(1);
});

test("rejects unsigned events without persisting them", async () => {
  const id = crypto.randomUUID();
  ids.push(id);
  const unsigned = request(id);
  unsigned.headers.delete("x-slack-signature");
  expect((await handleSlackEvents(unsigned)).status).toBe(401);
  expect(
    await db.query.slackEventJobs.findFirst({ where: eq(slackEventJobs.eventId, id) }),
  ).toBeUndefined();
});
