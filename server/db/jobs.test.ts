import { expect, test } from "bun:test";
import { lastRunAt, readState, recordRunFailure, recordRunStart, writeState } from "./jobs.ts";

test("a job that has never run has no last run", async () => {
  expect(await lastRunAt("never-run")).toBeUndefined();
});

test("a run is recorded and read back", async () => {
  const before = Date.now();
  await recordRunStart("recorded");

  const at = await lastRunAt("recorded");

  expect(at).toBeDefined();
  expect(at!.getTime()).toBeGreaterThanOrEqual(before - 1000);
});

test("a second run replaces the first rather than failing on the key", async () => {
  await recordRunStart("repeated");
  const first = await lastRunAt("repeated");

  await recordRunFailure("repeated", "the seedbox did not answer");
  await recordRunStart("repeated");

  const second = await lastRunAt("repeated");
  expect(second!.getTime()).toBeGreaterThanOrEqual(first!.getTime());
});

test("state survives being written twice under the same key", async () => {
  await writeState("seedbox-health:announced", { condition: "low", at: 1 });
  await writeState("seedbox-health:announced", { condition: "ok", at: 2 });

  const state = await readState<{ condition: string; at: number }>("seedbox-health:announced");
  expect(state).toEqual({ condition: "ok", at: 2 });
});

test("state nobody has written reads as undefined, not null", async () => {
  expect(await readState("nothing:here")).toBeUndefined();
});
