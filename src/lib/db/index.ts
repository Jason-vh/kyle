import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";

import { createLogger } from "@/lib/logger";

import * as schema from "./schema";

const logger = createLogger("db");

// Database file path - stored in project root
const DB_PATH = "./data/kyle.db";

// Ensure data directory exists
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

try {
	mkdirSync(dirname(DB_PATH), { recursive: true });
} catch {
	// Directory already exists
}

// Create SQLite connection
const sqlite = new Database(DB_PATH);

// Enable WAL mode for better concurrent performance
sqlite.exec("PRAGMA journal_mode = WAL;");

// Create Drizzle instance with schema
export const db = drizzle(sqlite, { schema });

logger.info("database initialized", { path: DB_PATH });

// Export schema for use elsewhere
export * from "./schema";
