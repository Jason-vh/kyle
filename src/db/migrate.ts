import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("DATABASE_URL environment variable is required");
  process.exit(1);
}

const isLocal =
  connectionString.includes("localhost") ||
  connectionString.includes("railway.internal");

const client = postgres(connectionString, {
  max: 1,
  ssl: isLocal ? false : "require",
});
const db = drizzle(client);

console.log("Running database migrations...");

try {
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations completed successfully");
  await client.end();
  process.exit(0);
} catch (error) {
  console.error("Migration failed:", error);
  await client.end();
  process.exit(1);
}
