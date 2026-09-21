import { afterEach, expect, test } from "bun:test";
import { inArray } from "drizzle-orm";
import { db } from "#server/db/index.ts";
import { slackEventJobs, webhookJobs } from "#server/db/schema.ts";
import { getDeliveryHealth } from "#server/db/delivery-health.ts";
import { processSlackEvent } from "#server/slack/jobs.ts";
import { processWebhookJobs } from "#server/webhooks/jobs.ts";
import { handleHealth } from "./health.ts";

const webhookIds: string[] = [];
const slackIds: string[] = [];
const media = { mediaType: "movie", title: "Arrival", year: 2016 } as const;
const event = { type: "message", channel: "C1", user: "U1", ts: "1", text: "Hello" };

afterEach(async () => {
  if (webhookIds.length) {
    await db.delete(webhookJobs).where(inArray(webhookJobs.id, webhookIds.splice(0)));
  }
  if (slackIds.length) {
    await db.delete(slackEventJobs).where(inArray(slackEventJobs.eventId, slackIds.splice(0)));
  }
});

async function webhook(availableAt = new Date()) {
  const [job] = await db
    .insert(webhookJobs)
    .values({ batchKey: crypto.randomUUID(), ids: { radarr: 1 }, media, availableAt })
    .returning();
  webhookIds.push(job!.id);
  return job!;
}

async function slackEvent(availableAt = new Date()) {
  const eventId = crypto.randomUUID();
  slackIds.push(eventId);
  const [job] = await db.insert(slackEventJobs).values({ eventId, event, availableAt }).returning();
  return job!;
}

test("failed webhook delivery degrades health until its persisted retry succeeds", async () => {
  const job = await webhook();
  await processWebhookJobs(new Date(), async () => {
    throw new Error("Private upstream failure");
  });
  const failed = await handleHealth();
  expect(failed.status).toBe(503);
  const body = await failed.json();
  expect(body).toMatchObject({
    database: "connected",
    deliveries: { webhooks: { pending: 1, failed: 1, maxAttempts: 1 } },
  });
  expect(JSON.stringify(body)).not.toContain("Private upstream failure");
  const stored = await db.query.webhookJobs.findFirst({
    where: (table, { eq }) => eq(table.id, job.id),
  });
  await processWebhookJobs(stored!.availableAt, async () => {});
  expect((await handleHealth()).status).toBe(200);
});

test("failed Slack delivery degrades health until its persisted retry succeeds", async () => {
  const job = await slackEvent();
  await processSlackEvent(job.eventId, async () => {
    throw new Error("Private Slack failure");
  });
  const failed = await handleHealth();
  expect(failed.status).toBe(503);
  expect(await failed.json()).toMatchObject({
    deliveries: { slack: { pending: 1, failed: 1, maxAttempts: 1 } },
  });
  const stored = await db.query.slackEventJobs.findFirst({
    where: (table, { eq }) => eq(table.eventId, job.eventId),
  });
  await processSlackEvent(job.eventId, async () => "Recovered", stored!.availableAt);
  expect((await handleHealth()).status).toBe(200);
});

test("new jobs and future episode batches are healthy, but overdue work is not", async () => {
  const now = new Date();
  const batched = await webhook(new Date(now.getTime() + 10 * 60_000));
  const immediate = await slackEvent(now);
  const initial = await getDeliveryHealth(now);
  expect(initial.healthy).toBe(true);
  expect(initial.workers.webhooks).toMatchObject({ pending: 1, failed: 0, overdue: 0 });
  expect(initial.workers.slack).toMatchObject({ pending: 1, failed: 0, overdue: 0 });
  expect(new Date(initial.workers.webhooks!.oldestPendingAt!).getTime()).toBe(
    batched.createdAt.getTime(),
  );
  expect(new Date(initial.workers.slack!.oldestPendingAt!).getTime()).toBe(
    immediate.createdAt.getTime(),
  );

  const overdue = await getDeliveryHealth(new Date(now.getTime() + 6 * 60_000));
  expect(overdue.healthy).toBe(false);
  expect(overdue.workers.webhooks?.overdue).toBe(0);
  expect(overdue.workers.slack?.overdue).toBe(1);
});
