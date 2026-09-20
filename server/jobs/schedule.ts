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
const status = new Map<
  string,
  { state: "starting" | "scheduled" | "running" | "failed"; error?: string }
>();
const INITIALIZATION_RETRY_MS = 30_000;

export function getJobHealth() {
  return {
    healthy: [...status.values()].every(
      (job) => job.state === "scheduled" || job.state === "running",
    ),
    jobs: Object.fromEntries(status),
  };
}

function armed(job: Job, delayMs: number): void {
  log.info("job armed", { job: job.name, dueInMs: delayMs });
  setTimeout(() => tick(job), delayMs);
}

async function tick(job: Job): Promise<void> {
  if (running.has(job.name)) {
    log.warn("job still running, skipping this turn", { job: job.name });
    armed(job, job.intervalMs);
    return;
  }

  running.add(job.name);
  status.set(job.name, { state: "running" });
  const startedAt = Date.now();

  try {
    await recordRunStart(job.name);
    await job.run();
    status.set(job.name, { state: "scheduled" });
    log.info("job finished", { job: job.name, ms: Date.now() - startedAt });
  } catch (error) {
    const message = errorMessage(error);
    status.set(job.name, { state: "failed", error: message });
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
async function initialize(job: Job): Promise<void> {
  try {
    const last = await lastRunAt(job.name);
    armed(job, msUntilNext(job.intervalMs, last, Date.now()));
    status.set(job.name, { state: "scheduled" });
  } catch (error) {
    const message = errorMessage(error);
    status.set(job.name, { state: "failed", error: message });
    log.error("job initialization failed, retrying", { job: job.name, error: message });
    setTimeout(() => initialize(job), INITIALIZATION_RETRY_MS);
  }
}

export async function every(name: string, intervalMs: number, run: Job["run"]): Promise<void> {
  if (status.has(name)) return;
  status.set(name, { state: "starting" });
  await initialize({ name, intervalMs, run });
}
