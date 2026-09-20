import { afterEach, expect, spyOn, test } from "bun:test";
import * as jobStore from "#server/db/jobs.ts";
import { handleHealth } from "#server/routes/health.ts";
import { every, getJobHealth, HOUR_MS } from "./schedule.ts";

const restore: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of restore.splice(0)) cleanup();
});

function timers() {
  const pending: { run: () => Promise<void>; delay: number }[] = [];
  const timer = spyOn(globalThis, "setTimeout").mockImplementation(((
    run: () => Promise<void>,
    delay: number,
  ) => {
    pending.push({ run, delay });
    return 0;
  }) as unknown as typeof setTimeout);
  restore.push(() => timer.mockRestore());
  return pending;
}

test("initialization retries after an outage while other workers still start", async () => {
  const pending = timers();
  const failedName = crypto.randomUUID();
  const otherName = crypto.randomUUID();
  let unavailable = true;
  const read = spyOn(jobStore, "lastRunAt").mockImplementation(async (name) => {
    if (name === failedName && unavailable) throw new Error("Database unavailable");
    return undefined;
  });
  restore.push(() => read.mockRestore());
  let runs = 0;
  await Promise.all([
    every(failedName, HOUR_MS, async () => {
      runs++;
    }),
    every(otherName, HOUR_MS, async () => {}),
  ]);

  expect(getJobHealth().jobs[failedName]?.state).toBe("failed");
  expect(getJobHealth().jobs[otherName]?.state).toBe("scheduled");
  expect((await handleHealth()).status).toBe(503);
  const retry = pending.find((timer) => timer.delay === 30_000)!;
  unavailable = false;
  await retry.run();
  expect(getJobHealth().jobs[failedName]?.state).toBe("scheduled");
  expect((await handleHealth()).status).toBe(200);

  await pending.at(-1)!.run();
  expect(runs).toBe(1);
  expect(pending.at(-1)!.delay).toBe(HOUR_MS);
});

test("a repeated startup cannot arm the same worker twice", async () => {
  const pending = timers();
  const name = crypto.randomUUID();
  await Promise.all([every(name, HOUR_MS, async () => {}), every(name, HOUR_MS, async () => {})]);
  expect(pending).toHaveLength(1);
});

test("a failed run reports degraded health and recovers on its next run", async () => {
  const pending = timers();
  const name = crypto.randomUUID();
  let failed = true;
  await every(name, HOUR_MS, async () => {
    if (failed) throw new Error("Service unavailable");
  });
  await pending.at(-1)!.run();
  expect(getJobHealth().jobs[name]?.state).toBe("failed");
  expect((await handleHealth()).status).toBe(503);
  failed = false;
  await pending.at(-1)!.run();
  expect(getJobHealth().jobs[name]?.state).toBe("scheduled");
  expect((await handleHealth()).status).toBe(200);
});
