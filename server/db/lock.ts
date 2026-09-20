import postgres from "postgres";
import { AsyncLocalStorage } from "node:async_hooks";
import { requireEnv } from "#server/config.ts";

const waiting = new Map<string, Promise<void>>();
const lockDepth = new AsyncLocalStorage<number>();
const connectionPools = new Map<number, ReturnType<typeof postgres>>();

async function withPostgresLock<T>(key: string, run: () => Promise<T>): Promise<T> {
  const [url] = requireEnv("DATABASE_URL");
  if (url.startsWith("pglite://")) return run();
  const depth = lockDepth.getStore() ?? 0;
  let connections = connectionPools.get(depth);
  if (!connections) {
    connections = postgres(url, { max: 10, idle_timeout: 20, connect_timeout: 10 });
    connectionPools.set(depth, connections);
  }
  const connection = await connections.reserve();
  try {
    await connection`SELECT pg_advisory_lock(hashtextextended(${key}, 0))`;
    try {
      return await lockDepth.run(depth + 1, run);
    } finally {
      await connection`SELECT pg_advisory_unlock(hashtextextended(${key}, 0))`;
    }
  } finally {
    connection.release();
  }
}

export async function withDatabaseLock<T>(key: string, run: () => Promise<T>): Promise<T> {
  const previous = waiting.get(key) ?? Promise.resolve();
  const done = Promise.withResolvers<void>();
  waiting.set(key, done.promise);
  try {
    await previous;
    return await withPostgresLock(key, run);
  } finally {
    done.resolve();
    if (waiting.get(key) === done.promise) waiting.delete(key);
  }
}
