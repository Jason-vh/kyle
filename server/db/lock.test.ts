import { expect, test } from "bun:test";
import { withDatabaseLock } from "./lock.ts";

test("nested locks make progress when every outer connection is reserved", async () => {
  const prefix = crypto.randomUUID();
  const ready = Promise.withResolvers<void>();
  let entered = 0;
  let completed = 0;
  await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      withDatabaseLock(`${prefix}:outer:${i}`, async () => {
        entered++;
        if (entered === 10) ready.resolve();
        await ready.promise;
        await withDatabaseLock(`${prefix}:inner:${i}`, async () => {
          await withDatabaseLock(`${prefix}:media:${i}`, async () => {
            completed++;
          });
        });
      }),
    ),
  );
  expect(completed).toBe(10);
}, 15_000);

test("failed nested work releases both locks", async () => {
  const key = crypto.randomUUID();
  await expect(
    withDatabaseLock(`${key}:outer`, () =>
      withDatabaseLock(`${key}:inner`, async () => {
        throw new Error("failed");
      }),
    ),
  ).rejects.toThrow("failed");
  expect(
    await withDatabaseLock(`${key}:outer`, () =>
      withDatabaseLock(`${key}:inner`, async () => "recovered"),
    ),
  ).toBe("recovered");
});
