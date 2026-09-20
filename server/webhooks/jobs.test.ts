import { afterEach, expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { db } from "#server/db/index.ts";
import {
  conversations,
  notificationDeliveries,
  notifications,
  webhookJobs,
} from "#server/db/schema.ts";
import { createTestUser, deleteTestUser } from "#server/db/testing.ts";
import { saveNotifications } from "#server/db/notifications.ts";
import { enqueueWebhook, processWebhookJobs } from "./jobs.ts";
import { deliverNotification } from "./notify.ts";
import { BATCH_DELAY_MS } from "./batch.ts";

const jobs: string[] = [];
const conversationIds: string[] = [];
const userIds: string[] = [];
const movie = { mediaType: "movie", title: "Arrival", year: 2016 } as const;

afterEach(async () => {
  for (const userId of userIds.splice(0)) await deleteTestUser(userId);
  if (jobs.length) await db.delete(webhookJobs).where(inArray(webhookJobs.id, jobs.splice(0)));
  if (conversationIds.length)
    await db.delete(conversations).where(inArray(conversations.id, conversationIds.splice(0)));
});

async function job() {
  const id = await enqueueWebhook({ radarr: 12 }, movie, new Date(0));
  jobs.push(id);
  return id;
}

test("persists and merges concurrent episode webhooks without extending the batch", async () => {
  const now = new Date();
  const media = { mediaType: "series" as const, title: "Severance", year: 2022 };
  const episode = { seasonNumber: 1, episodeNumber: 1, title: "First" };
  const ids = await Promise.all([
    enqueueWebhook({ sonarr: 12345 }, { ...media, episodes: [episode] }, now),
    enqueueWebhook(
      { sonarr: 12345 },
      { ...media, episodes: [episode, { ...episode, episodeNumber: 2 }] },
      now,
    ),
  ]);
  jobs.push(ids[0]!);
  expect(ids[0]).toBe(ids[1]);
  const stored = await db.query.webhookJobs.findFirst({ where: eq(webhookJobs.id, ids[0]!) });
  expect(stored!.media.episodes).toHaveLength(2);
  expect(stored!.availableAt.getTime()).toBe(now.getTime() + BATCH_DELAY_MS);

  let delivered = 0;
  await processWebhookJobs(now, async () => {
    delivered++;
  });
  expect(delivered).toBe(0);
  await processWebhookJobs(stored!.availableAt, async () => {
    delivered++;
  });
  expect(delivered).toBe(1);
});

test("a failed delivery survives a new worker invocation and retries after backoff", async () => {
  const id = await job();
  await processWebhookJobs(new Date(0), async () => {
    throw new Error("offline");
  });
  const failed = await db.query.webhookJobs.findFirst({ where: eq(webhookJobs.id, id) });
  expect(failed).toMatchObject({ completedAt: null, attempts: 1, lastError: "offline" });

  let delivered = 0;
  await processWebhookJobs(new Date(1), async () => {
    delivered++;
  });
  expect(delivered).toBe(0);
  await processWebhookJobs(failed!.availableAt, async () => {
    delivered++;
  });
  await processWebhookJobs(new Date(failed!.availableAt.getTime() + 1), async () => {
    delivered++;
  });
  expect(delivered).toBe(1);
  expect(
    (await db.query.webhookJobs.findFirst({ where: eq(webhookJobs.id, id) }))!.completedAt,
  ).not.toBeNull();
});

test("retries do not duplicate in-app notifications", async () => {
  const id = await job();
  const userId = await createTestUser();
  userIds.push(userId);
  const notification = { mediaType: "movie" as const, title: "Arrival", body: "Ready" };
  await saveNotifications([userId], notification, id);
  await saveNotifications([userId], notification, id);
  expect(
    await db.select().from(notifications).where(eq(notifications.userId, userId)),
  ).toHaveLength(1);
});

test("an unavailable Discord client leaves the delivery pending for retry", async () => {
  const jobId = await job();
  const [conversation] = await db
    .insert(conversations)
    .values({ interfaceType: "discord" })
    .returning();
  conversationIds.push(conversation!.id);
  const [delivery] = await db
    .insert(notificationDeliveries)
    .values({
      jobId,
      conversationId: conversation!.id,
      requester: {
        interfaceType: "discord",
        channelId: "unavailable-channel",
        conversationId: conversation!.id,
        title: "Arrival",
      },
      responseText: "Ready",
    })
    .returning();

  await processWebhookJobs(new Date(0), async () => {
    await deliverNotification(delivery!, movie);
  });

  const stored = await db.query.notificationDeliveries.findFirst({
    where: eq(notificationDeliveries.id, delivery!.id),
  });
  const failed = await db.query.webhookJobs.findFirst({ where: eq(webhookJobs.id, jobId) });
  expect(stored).toMatchObject({ responseText: "Ready", sentAt: null });
  expect(failed).toMatchObject({
    completedAt: null,
    lastError: "Discord notification could not be delivered",
  });
});

test("chat retries reuse the prepared reply and skip completed deliveries", async () => {
  const jobId = await job();
  const [conversation] = await db
    .insert(conversations)
    .values({ interfaceType: "slack" })
    .returning();
  conversationIds.push(conversation!.id);
  const [delivery] = await db
    .insert(notificationDeliveries)
    .values({
      jobId,
      conversationId: conversation!.id,
      requester: {
        interfaceType: "slack",
        channel: "C1",
        threadTs: "1",
        conversationId: conversation!.id,
        title: "Arrival",
      },
    })
    .returning();
  let prepared = 0;
  let sent = 0;
  const prepare = async () => {
    prepared++;
    return "Ready";
  };
  await expect(
    deliverNotification(delivery!, movie, prepare, async () => {
      throw new Error("offline");
    }),
  ).rejects.toThrow("offline");
  const retry = await db.query.notificationDeliveries.findFirst({
    where: eq(notificationDeliveries.id, delivery!.id),
  });
  expect(retry).toMatchObject({ responseText: "Ready", sentAt: null });
  await deliverNotification(retry!, movie, prepare, async () => {
    sent++;
  });
  const completed = await db.query.notificationDeliveries.findFirst({
    where: eq(notificationDeliveries.id, delivery!.id),
  });
  await deliverNotification(completed!, movie, prepare, async () => {
    sent++;
  });
  expect(prepared).toBe(1);
  expect(sent).toBe(1);
});
