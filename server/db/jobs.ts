import { eq, sql } from "drizzle-orm";
import { db } from "./index.ts";
import { jobRuns, jobState } from "./schema.ts";

/** When the job last started, or undefined if it never has here. */
export async function lastRunAt(name: string): Promise<Date | undefined> {
  const [row] = await db
    .select({ lastRunAt: jobRuns.lastRunAt })
    .from(jobRuns)
    .where(eq(jobRuns.name, name));

  return row?.lastRunAt;
}

/**
 * Marks the job as running now. Recorded before the work, so a job that fails
 * hard waits its interval rather than repeating on every restart.
 */
export async function recordRunStart(name: string): Promise<void> {
  await db
    .insert(jobRuns)
    .values({ name, lastRunAt: new Date(), lastError: null })
    .onConflictDoUpdate({
      target: jobRuns.name,
      set: { lastRunAt: new Date(), lastError: null },
    });
}

export async function recordRunFailure(name: string, error: string): Promise<void> {
  await db.update(jobRuns).set({ lastError: error }).where(eq(jobRuns.name, name));
}

/** What a job remembered last time, under a key of its own choosing. */
export async function readState<T>(key: string): Promise<T | undefined> {
  const [row] = await db
    .select({ value: jobState.value })
    .from(jobState)
    .where(eq(jobState.key, key));
  return row?.value as T | undefined;
}

export async function writeState(key: string, value: unknown): Promise<void> {
  await db
    .insert(jobState)
    .values({ key, value })
    .onConflictDoUpdate({
      target: jobState.key,
      set: { value, updatedAt: sql`now()` },
    });
}
