const waiting = new Map<string, Promise<void>>();

/**
 * Runs `run` once every earlier holder of `key` has finished. Exclusion is
 * in-process: Kyle runs as one process, which pi-durable's storage requires.
 */
export async function withLock<T>(key: string, run: () => Promise<T>): Promise<T> {
  const previous = waiting.get(key) ?? Promise.resolve();
  const done = Promise.withResolvers<void>();
  waiting.set(key, done.promise);
  try {
    await previous;
    return await run();
  } finally {
    done.resolve();
    if (waiting.get(key) === done.promise) waiting.delete(key);
  }
}
