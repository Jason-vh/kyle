import { lastRunAt, recordRunFailure, recordRunStart } from "#server/db/jobs.ts";
import { createLogger } from "#server/logger.ts";
import { errorMessage } from "#server/errors.ts";

const log = createLogger("jobs");

export const MINUTE_MS = 60 * 1000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

/**
 * Nothing runs in the first minutes of a process. A deploy has the server
 * coming up, the Discord bot connecting and migrations just finished; an
 * overdue job joining that is how a restart turns into an outage.
 */
const STARTUP_DELAY_MS = 2 * MINUTE_MS;

export interface Job {
  name: string;
  intervalMs: number;
  run: () => Promise<unknown>;
}

/**
 * How long until this job is next due. A job that has never run here, or is
 * already overdue, still waits out the startup delay — which is also what
 * keeps a burst of deploys from running an hourly job once per deploy.
 */
export function msUntilNext(intervalMs: number, last: Date | undefined, now: number): number {
  if (!last) return STARTUP_DELAY_MS;
  return Math.max(last.getTime() + intervalMs - now, STARTUP_DELAY_MS);
}

const running = new Set<string>();

function armed(job: Job, delayMs: number): void {
  log.info("job armed", { job: job.name, dueInMs: delayMs });
  setTimeout(() => void tick(job), delayMs);
}

async function tick(job: Job): Promise<void> {
  if (running.has(job.name)) {
    log.warn("job still running, skipping this turn", { job: job.name });
    armed(job, job.intervalMs);
    return;
  }

  running.add(job.name);
  const startedAt = Date.now();

  try {
    await recordRunStart(job.name);
    await job.run();
    log.info("job finished", { job: job.name, ms: Date.now() - startedAt });
  } catch (error) {
    const message = errorMessage(error);
    log.error("job failed", { job: job.name, ms: Date.now() - startedAt, error: message });
    await recordRunFailure(job.name, message).catch(() => {});
  } finally {
    running.delete(job.name);
    armed(job, job.intervalMs);
  }
}

/**
 * Run this every `intervalMs`, for as long as the process lives. Failures are
 * logged and the schedule carries on: a job that throws must not take the
 * server down with it, and must not stop running either.
 */
export async function every(name: string, intervalMs: number, run: Job["run"]): Promise<void> {
  const job = { name, intervalMs, run };
  armed(job, msUntilNext(intervalMs, await lastRunAt(name), Date.now()));
}
