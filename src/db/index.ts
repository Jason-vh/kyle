import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.ts";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is required");
}

// SSL not needed for localhost or Railway internal network
const isLocal =
  connectionString.includes("localhost") ||
  connectionString.includes("railway.internal");

const client = postgres(connectionString, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  ssl: isLocal ? false : "require",
});

export const db = drizzle(client, { schema });

// Health check function
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await client`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
