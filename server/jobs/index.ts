import { checkSeedbox } from "#server/ultra/health.ts";
import { sweep } from "#server/janitor/run.ts";
import { DAY_MS, every, HOUR_MS } from "./schedule.ts";
import { processWebhookJobs } from "#server/webhooks/jobs.ts";
import { processSlackEvents } from "#server/slack/jobs.ts";

/** What runs on its own, and how often. The one list of it. */
export async function startJobs(): Promise<void> {
  await Promise.all([
    every("webhook-delivery", 30_000, processWebhookJobs),
    every("slack-events", 30_000, processSlackEvents),
    every("seedbox-health", HOUR_MS, checkSeedbox),
    every("janitor", DAY_MS, () => sweep(true)),
  ]);
}
