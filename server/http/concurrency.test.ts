import { expect, test } from "bun:test";
import { CapacityError, createConcurrencyLimit } from "./concurrency.ts";

test("bounds active work and rejects overflow instead of growing the queue", async () => {
  const limit = createConcurrencyLimit(2, 1);
  const gates = [Promise.withResolvers<void>(), Promise.withResolvers<void>()];
  const started: number[] = [];
  const tasks = [0, 1, 2].map((id) =>
    limit(async () => {
      started.push(id);
      await gates[id]?.promise;
      return id;
    }),
  );
  expect(started).toEqual([0, 1]);
  await expect(limit(async () => 3)).rejects.toBeInstanceOf(CapacityError);
  gates[0]!.resolve();
  await tasks[0];
  gates[1]!.resolve();
  expect(await Promise.all(tasks)).toEqual([0, 1, 2]);
  expect(started).toEqual([0, 1, 2]);
});

test("cancels queued work without consuming a future slot", async () => {
  const limit = createConcurrencyLimit(1, 1);
  const gate = Promise.withResolvers<void>();
  const first = limit(() => gate.promise);
  const controller = new AbortController();
  let called = false;
  const queued = limit(async () => {
    called = true;
  }, controller.signal);
  controller.abort(new Error("Cancelled"));
  await expect(queued).rejects.toThrow("Cancelled");
  const next = limit(async () => "next");
  gate.resolve();
  await first;
  expect(await next).toBe("next");
  expect(called).toBe(false);
});

test("failed work releases its slot", async () => {
  const limit = createConcurrencyLimit(1, 0);
  await expect(
    limit(async () => {
      throw new Error("Failed");
    }),
  ).rejects.toThrow("Failed");
  expect(await limit(async () => "recovered")).toBe("recovered");
});

test("already cancelled work never runs", async () => {
  const limit = createConcurrencyLimit(1, 0);
  const controller = new AbortController();
  controller.abort(new Error("Cancelled"));
  let called = false;
  await expect(
    limit(async () => {
      called = true;
    }, controller.signal),
  ).rejects.toThrow("Cancelled");
  expect(called).toBe(false);
  expect(await limit(async () => "recovered")).toBe("recovered");
});
