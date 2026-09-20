import { and, asc, eq, gt, isNull, lte, sql } from "drizzle-orm";
import { db } from "#server/db/index.ts";
import { withDatabaseLock } from "#server/db/lock.ts";
import { webhookJobs } from "#server/db/schema.ts";
import { createLogger } from "#server/logger.ts";
import { errorMessage } from "#server/errors.ts";
import { announce } from "./announce.ts";
import { BATCH_DELAY_MS, mergeMedia } from "./batch.ts";
import type { MediaNotificationInfo } from "./types.ts";

const log = createLogger("webhooks:jobs");
type Job = typeof webhookJobs.$inferSelect;
type Delivery = (ids: Job["ids"], media: MediaNotificationInfo, jobId: string) => Promise<unknown>;

export async function enqueueWebhook(
  ids: Job["ids"],
  media: MediaNotificationInfo,
  now = new Date(),
): Promise<string> {
  const batchKey = `${media.mediaType}:${ids.radarr ?? ids.sonarr}`;
  return withDatabaseLock(`webhook:${batchKey}`, async () => {
    if (media.mediaType === "series") {
      const pending = await db.query.webhookJobs.findFirst({
        where: and(
          eq(webhookJobs.batchKey, batchKey),
          isNull(webhookJobs.completedAt),
          eq(webhookJobs.attempts, 0),
          gt(webhookJobs.availableAt, now),
        ),
        orderBy: asc(webhookJobs.createdAt),
      });
      if (pending) {
        await db
          .update(webhookJobs)
          .set({ media: mergeMedia(pending.media, media) })
          .where(eq(webhookJobs.id, pending.id));
        return pending.id;
      }
    }
    const delay = media.mediaType === "series" ? BATCH_DELAY_MS : 0;
    const [job] = await db
      .insert(webhookJobs)
      .values({ batchKey, ids, media, availableAt: new Date(now.getTime() + delay) })
      .returning();
    return job!.id;
  });
}

export async function processWebhookJobs(
  now = new Date(),
  deliver: Delivery = announce,
): Promise<void> {
  const pending = await db
    .select()
    .from(webhookJobs)
    .where(and(isNull(webhookJobs.completedAt), lte(webhookJobs.availableAt, now)))
    .orderBy(asc(webhookJobs.availableAt))
    .limit(50);
  for (const candidate of pending) {
    await withDatabaseLock(`webhook-job:${candidate.id}`, async () => {
      const job = await db.query.webhookJobs.findFirst({ where: eq(webhookJobs.id, candidate.id) });
      if (!job || job.completedAt || job.availableAt > now) return;
      await db
        .update(webhookJobs)
        .set({ attempts: sql`${webhookJobs.attempts} + 1` })
        .where(eq(webhookJobs.id, job.id));
      try {
        await deliver(job.ids, job.media, job.id);
        await db
          .update(webhookJobs)
          .set({ completedAt: new Date(), lastError: null })
          .where(eq(webhookJobs.id, job.id));
      } catch (error) {
        const retryMs = Math.min(3_600_000, 30_000 * 2 ** Math.min(job.attempts, 7));
        const lastError = errorMessage(error);
        await db
          .update(webhookJobs)
          .set({ lastError, availableAt: new Date(now.getTime() + retryMs) })
          .where(eq(webhookJobs.id, job.id));
        log.error("notification queued for retry", { jobId: job.id, error: lastError, retryMs });
      }
    });
  }
}
