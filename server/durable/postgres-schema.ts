import { sql, type SQL } from "drizzle-orm";
import { query, type Database } from "#server/db/index.ts";

/** A table in the storage's own schema, kept apart from the drizzle-managed one. */
export function durableTable(schema: string, name: string): SQL {
  return sql`${sql.identifier(schema)}.${sql.identifier(name)}`;
}

type Migration = (table: (name: string) => SQL) => SQL[];

const initialSchema: Migration = (table) => [
  sql`CREATE TABLE ${table("durable_metadata")} (
    singleton SMALLINT PRIMARY KEY CHECK (singleton = 1),
    next_id BIGINT NOT NULL,
    next_seq BIGINT NOT NULL
  )`,
  sql`INSERT INTO ${table("durable_metadata")} (singleton, next_id, next_seq) VALUES (1, 2, 1)`,
  sql`CREATE TABLE ${table("record_ids")} (
    id BIGINT PRIMARY KEY,
    record_type TEXT NOT NULL
      CHECK (record_type IN ('conversation', 'entry', 'task', 'submission', 'document'))
  )`,
  sql`CREATE TABLE ${table("conversations")} (
    id BIGINT PRIMARY KEY,
    owner_conversation_id BIGINT,
    owner_task_id BIGINT,
    record TEXT NOT NULL
  )`,
  sql`CREATE INDEX conversations_by_owner_conversation
    ON ${table("conversations")} (owner_conversation_id, id)`,
  sql`CREATE INDEX conversations_by_owner_task ON ${table("conversations")} (owner_task_id, id)`,
  sql`CREATE TABLE ${table("entries")} (
    id BIGINT PRIMARY KEY,
    conversation_id BIGINT NOT NULL,
    head BIGINT,
    commit_seq BIGINT NOT NULL,
    record TEXT NOT NULL
  )`,
  sql`CREATE INDEX entries_by_conversation ON ${table("entries")} (conversation_id, id DESC)`,
  sql`CREATE INDEX entry_heads_by_conversation ON ${table("entries")} (conversation_id, id DESC)
    WHERE head IS NOT NULL`,
  sql`CREATE TABLE ${table("tasks")} (
    id BIGINT PRIMARY KEY,
    conversation_id BIGINT NOT NULL,
    kind TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'waiting', 'completing', 'terminal')),
    abort_requested BOOLEAN NOT NULL,
    background BOOLEAN NOT NULL,
    record TEXT NOT NULL
  )`,
  sql`CREATE INDEX tasks_by_status ON ${table("tasks")} (status, id)`,
  sql`CREATE INDEX tasks_by_conversation ON ${table("tasks")} (conversation_id, id)`,
  sql`CREATE INDEX tasks_by_kind ON ${table("tasks")} (kind, id)`,
  sql`CREATE INDEX tasks_by_abort_requested ON ${table("tasks")} (abort_requested, id)`,
  sql`CREATE INDEX tasks_by_background ON ${table("tasks")} (background, id)`,
  sql`CREATE TABLE ${table("submissions")} (
    id BIGINT PRIMARY KEY,
    conversation_id BIGINT NOT NULL,
    request_id TEXT,
    status TEXT NOT NULL CHECK (status IN ('queued', 'placed', 'done', 'unanswered')),
    record TEXT NOT NULL
  )`,
  sql`CREATE INDEX submissions_by_request ON ${table("submissions")} (conversation_id, request_id)`,
  sql`CREATE INDEX submissions_by_conversation ON ${table("submissions")} (conversation_id, id)`,
  sql`CREATE INDEX submissions_by_status ON ${table("submissions")} (status, id)`,
  sql`CREATE TABLE ${table("documents")} (
    id BIGINT PRIMARY KEY,
    kind TEXT NOT NULL,
    family BOOLEAN NOT NULL,
    key_value TEXT NOT NULL,
    scope_kind TEXT NOT NULL CHECK (scope_kind IN ('session', 'conversation', 'task')),
    owner_id BIGINT NOT NULL,
    created_at BIGINT NOT NULL,
    retired_at BIGINT,
    record TEXT NOT NULL
  )`,
  sql`CREATE INDEX documents_by_address ON ${table("documents")}
    (kind, scope_kind, owner_id, family, key_value, created_at DESC, retired_at)`,
  sql`CREATE INDEX documents_by_scope ON ${table("documents")} (scope_kind, owner_id, id)`,
  sql`CREATE INDEX documents_by_scope_kind ON ${table("documents")} (scope_kind, owner_id, kind, id)`,
  sql`CREATE TABLE ${table("document_revisions")} (
    document_id BIGINT NOT NULL,
    seq BIGINT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('base', 'delta')),
    version INTEGER NOT NULL,
    content TEXT NOT NULL,
    PRIMARY KEY (document_id, seq)
  )`,
  sql`CREATE INDEX document_revisions_by_kind
    ON ${table("document_revisions")} (document_id, kind, seq DESC)`,
];

/** Ordered schema history; append new migrations, never edit shipped ones. */
const MIGRATIONS: readonly Migration[] = [initialSchema];

/** Creates the schema if needed and applies its pending migrations atomically. */
export async function migrateDurableSchema(db: Database, schema: string): Promise<void> {
  const table = (name: string) => durableTable(schema, name);
  await db.transaction(async (tx) => {
    await tx.execute(sql`CREATE SCHEMA IF NOT EXISTS ${sql.identifier(schema)}`);
    await tx.execute(sql`CREATE TABLE IF NOT EXISTS ${table("durable_schema")} (
      singleton SMALLINT PRIMARY KEY CHECK (singleton = 1),
      version INTEGER NOT NULL CHECK (version >= 0)
    )`);
    await tx.execute(
      sql`INSERT INTO ${table("durable_schema")} (singleton, version) VALUES (1, 0)
        ON CONFLICT (singleton) DO NOTHING`,
    );
    const [row] = await query<{ version: number }>(
      sql`SELECT version FROM ${table("durable_schema")} WHERE singleton = 1 FOR UPDATE`,
      tx,
    );
    const current = row!.version;
    if (current > MIGRATIONS.length) {
      throw new Error(
        `Durable Postgres schema version ${current} is newer than supported version ${MIGRATIONS.length}`,
      );
    }
    for (const [index, migration] of MIGRATIONS.entries()) {
      const version = index + 1;
      if (version <= current) continue;
      for (const statement of migration(table)) await tx.execute(statement);
      await tx.execute(
        sql`UPDATE ${table("durable_schema")} SET version = ${version} WHERE singleton = 1`,
      );
    }
  });
}
