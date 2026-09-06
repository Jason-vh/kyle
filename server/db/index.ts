import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { sql, type SQL } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import postgres from "postgres";
import * as schema from "./schema.ts";

/**
 * Postgres in this process, migrated and empty. Tests use it so they need no
 * Docker; the server never does, and pglite stays a devDependency the image
 * does not install.
 */
const IN_PROCESS = "pglite://";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is required");
}

type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

async function connect(url: string): Promise<Database> {
  if (!url.startsWith(IN_PROCESS)) {
    return drizzlePostgres(postgres(url, { max: 10, idle_timeout: 20, connect_timeout: 10 }), {
      schema,
    });
  }

  // Imported here so the branch, and the dependency, are absent in production.
  const [{ PGlite }, { drizzle }, { migrate }] = await Promise.all([
    import("@electric-sql/pglite"),
    import("drizzle-orm/pglite"),
    import("drizzle-orm/pglite/migrator"),
  ]);

  const client = drizzle(new PGlite(), { schema });
  await migrate(client, { migrationsFolder: "./drizzle" });
  return client;
}

export const db = await connect(connectionString);

/**
 * Rows from a raw statement, as an array whichever driver is underneath.
 *
 * `db.execute()` resolves to an array on postgres-js and to `{ rows }` on
 * pglite, so call sites use this instead. The assertion is unavoidable — a raw
 * statement has no inferable row type — but it lives here rather than at each
 * of the places that would otherwise have to guess.
 */
export async function query<T>(statement: SQL): Promise<T[]> {
  const result: unknown = await db.execute(statement);
  if (Array.isArray(result)) return result as T[];
  return (result as { rows: T[] }).rows;
}

export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await db.execute(sql`SELECT 1`);
    return true;
  } catch {
    return false;
  }
}
