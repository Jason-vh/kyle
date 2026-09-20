import { checkSeedbox } from "#server/ultra/health.ts";
import { every, HOUR_MS } from "./schedule.ts";
import { createLogger } from "#server/logger.ts";
import { errorMessage } from "#server/errors.ts";

const log = createLogger("jobs");

/** What runs on its own, and how often. The one list of it. */
export async function startJobs(): Promise<void> {
  try {
    await every("seedbox-health", HOUR_MS, checkSeedbox);
  } catch (error) {
    log.error("could not start jobs", { error: errorMessage(error) });
  }
}
