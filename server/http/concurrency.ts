export class CapacityError extends Error {
  constructor() {
    super("Too many pending upstream requests");
    this.name = "CapacityError";
  }
}

export function createConcurrencyLimit(maxActive: number, maxQueued: number) {
  if (
    !Number.isInteger(maxActive) ||
    maxActive < 1 ||
    !Number.isInteger(maxQueued) ||
    maxQueued < 0
  ) {
    throw new Error("Invalid concurrency limits");
  }
  let active = 0;
  const waiting: (() => void)[] = [];

  return async function run<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    signal?.throwIfAborted();
    if (active < maxActive) {
      active++;
    } else {
      if (waiting.length >= maxQueued) throw new CapacityError();
      await new Promise<void>((resolve, reject) => {
        const ready = () => {
          signal?.removeEventListener("abort", abort);
          resolve();
        };
        const abort = () => {
          const index = waiting.indexOf(ready);
          if (index !== -1) waiting.splice(index, 1);
          signal?.removeEventListener("abort", abort);
          reject(signal?.reason);
        };
        waiting.push(ready);
        signal?.addEventListener("abort", abort, { once: true });
      });
    }
    try {
      signal?.throwIfAborted();
      return await task();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  };
}
