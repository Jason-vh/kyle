import { expect, test } from "bun:test";
import { DAY_MS, HOUR_MS, MINUTE_MS, msUntilNext } from "./schedule.ts";

const NOW = Date.UTC(2026, 0, 2, 12, 0, 0);

test("a job that has never run waits out the startup delay", () => {
  expect(msUntilNext(HOUR_MS, undefined, NOW)).toBe(2 * MINUTE_MS);
});

test("a job waits the remainder of its interval", () => {
  const ranTwentyMinutesAgo = new Date(NOW - 20 * MINUTE_MS);
  expect(msUntilNext(HOUR_MS, ranTwentyMinutesAgo, NOW)).toBe(40 * MINUTE_MS);
});

/** The deploy case: the container restarts, and a daily job is owed a run. */
test("an overdue job runs shortly after startup rather than immediately", () => {
  const ranThreeDaysAgo = new Date(NOW - 3 * DAY_MS);
  expect(msUntilNext(DAY_MS, ranThreeDaysAgo, NOW)).toBe(2 * MINUTE_MS);
});

/**
 * Three deploys in an hour must not mean three runs: Ultra answers ten times
 * an hour and no more, and the seedbox check is one of them.
 */
test("a job that just ran is not repeated by a restart", () => {
  const ranFiveMinutesAgo = new Date(NOW - 5 * MINUTE_MS);
  expect(msUntilNext(HOUR_MS, ranFiveMinutesAgo, NOW)).toBe(55 * MINUTE_MS);
});

test("the delay after a run is the whole interval", () => {
  expect(msUntilNext(DAY_MS, new Date(NOW), NOW)).toBe(DAY_MS);
});
