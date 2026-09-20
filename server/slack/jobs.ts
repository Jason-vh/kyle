import { and, asc, eq, isNull, lte, sql } from "drizzle-orm";
import { db } from "#server/db/index.ts";
import { withDatabaseLock } from "#server/db/lock.ts";
import { slackEventJobs } from "#server/db/schema.ts";
import { createLogger } from "#server/logger.ts";
import { errorMessage } from "#server/errors.ts";
import type { SlackEvent } from "./events.ts";
import { processSlackMessage } from "./handler.ts";

const log = createLogger("slack:jobs");
type ProcessMessage = typeof processSlackMessage;

export async function enqueueSlackEvent(
  eventId: string,
  event: SlackEvent,
  teamId?: string,
): Promise<void> {
  await db
    .insert(slackEventJobs)
    .values({ eventId, event, teamId, availableAt: new Date() })
    .onConflictDoNothing();
}

export async function processSlackEvent(
  eventId: string,
  processMessage: ProcessMessage = processSlackMessage,
  now = new Date(),
): Promise<string | undefined> {
  return withDatabaseLock(`slack-event:${eventId}`, async () => {
    const job = await db.query.slackEventJobs.findFirst({
      where: eq(slackEventJobs.eventId, eventId),
    });
    if (!job) return;
    if (job.completedAt) return job.responseText ?? "";
    if (job.availableAt > now) return;

    await db
      .update(slackEventJobs)
      .set({ attempts: sql`${slackEventJobs.attempts} + 1` })
      .where(eq(slackEventJobs.eventId, eventId));
    try {
      const responseText = await processMessage(job.event, job.teamId ?? undefined);
      await db
        .update(slackEventJobs)
        .set({ responseText, completedAt: new Date(), lastError: null })
        .where(eq(slackEventJobs.eventId, eventId));
      return responseText;
    } catch (error) {
      const lastError = errorMessage(error);
      const retryMs = Math.min(3_600_000, 30_000 * 2 ** Math.min(job.attempts, 7));
      await db
        .update(slackEventJobs)
        .set({ lastError, availableAt: new Date(Date.now() + retryMs) })
        .where(eq(slackEventJobs.eventId, eventId));
      log.error("slack event queued for retry", { eventId, error: lastError, retryMs });
    }
  });
}

export async function processSlackEvents(
  now = new Date(),
  processMessage: ProcessMessage = processSlackMessage,
): Promise<void> {
  const pending = await db
    .select({ eventId: slackEventJobs.eventId })
    .from(slackEventJobs)
    .where(and(isNull(slackEventJobs.completedAt), lte(slackEventJobs.availableAt, now)))
    .orderBy(asc(slackEventJobs.availableAt))
    .limit(50);
  for (const { eventId } of pending) {
    await processSlackEvent(eventId, processMessage, now);
  }
}
