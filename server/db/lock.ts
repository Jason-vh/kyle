import postgres from "postgres";
import { requireEnv } from "#server/config.ts";

const waiting = new Map<string, Promise<void>>();
let connections: ReturnType<typeof postgres> | undefined;

async function withPostgresLock<T>(key: string, run: () => Promise<T>): Promise<T> {
  const [url] = requireEnv("DATABASE_URL");
  if (url.startsWith("pglite://")) return run();
  connections ??= postgres(url, { max: 10, idle_timeout: 20, connect_timeout: 10 });
  const connection = await connections.reserve();
  try {
    await connection`SELECT pg_advisory_lock(hashtextextended(${key}, 0))`;
    try {
      return await run();
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
