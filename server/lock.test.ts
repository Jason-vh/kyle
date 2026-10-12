import { expect, test } from "bun:test";
import { withLock } from "./lock.ts";

test("holders of one key run one at a time, in the order they asked", async () => {
  const key = crypto.randomUUID();
  const order: string[] = [];
  const first = Promise.withResolvers<void>();
  const runs = [
    withLock(key, async () => {
      order.push("first starts");
      await first.promise;
      order.push("first ends");
    }),
    withLock(key, async () => {
      order.push("second");
    }),
  ];
  await Promise.resolve();
  first.resolve();
  await Promise.all(runs);
  expect(order).toEqual(["first starts", "first ends", "second"]);
});

test("different keys do not wait for each other, nested or not", async () => {
  const key = crypto.randomUUID();
  const result = await withLock(`${key}:outer`, () =>
    withLock(`${key}:inner`, async () => "nested"),
  );
  expect(result).toBe("nested");
});

test("failed work releases its lock", async () => {
  const key = crypto.randomUUID();
  await expect(
    withLock(key, async () => {
      throw new Error("failed");
    }),
  ).rejects.toThrow("failed");
  expect(await withLock(key, async () => "recovered")).toBe("recovered");
});
