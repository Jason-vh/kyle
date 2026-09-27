import { afterEach, expect, setSystemTime, test } from "bun:test";
import { cached } from "./cache.ts";

afterEach(() => {
  setSystemTime();
});

function counter() {
  let calls = 0;
  return {
    load: async () => ++calls,
    get calls() {
      return calls;
    },
  };
}

test("loads once, and again only after the time to live", async () => {
  setSystemTime(new Date("2026-09-27T12:00:00Z"));
  const source = counter();
  const value = cached(60_000, source.load);

  expect(await value.get()).toBe(1);
  expect(await value.get()).toBe(1);

  setSystemTime(new Date("2026-09-27T12:00:59Z"));
  expect(await value.get()).toBe(1);

  setSystemTime(new Date("2026-09-27T12:01:00Z"));
  expect(await value.get()).toBe(2);
  expect(source.calls).toBe(2);
});

test("callers arriving while it loads share the one load", async () => {
  const source = counter();
  const value = cached(60_000, source.load);

  expect(await Promise.all([value.get(), value.get(), value.get()])).toEqual([1, 1, 1]);
  expect(source.calls).toBe(1);
});

test("a failed load is not kept", async () => {
  let fail = true;
  const value = cached(60_000, async () => {
    if (fail) throw new Error("unreachable");
    return "ok";
  });

  await expect(value.get()).rejects.toThrow("unreachable");
  fail = false;
  expect(await value.get()).toBe("ok");
});

test("invalidating forgets the value", async () => {
  const source = counter();
  const value = cached(60_000, source.load);

  expect(await value.get()).toBe(1);
  value.invalidate();
  expect(await value.get()).toBe(2);
});

test("a load that began before invalidating is neither kept nor shared", async () => {
  let release: (value: string) => void = () => {};
  const loads: string[] = [];
  const value = cached(60_000, () => {
    loads.push("load");
    if (loads.length === 1) return new Promise<string>((resolve) => (release = resolve));
    return Promise.resolve("fresh");
  });

  const stale = value.get();
  value.invalidate();
  expect(await value.get()).toBe("fresh");

  release("stale");
  expect(await stale).toBe("stale");
  expect(await value.get()).toBe("fresh");
  expect(loads).toHaveLength(2);
});
