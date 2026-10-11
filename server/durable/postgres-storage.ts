import type { Context, JsonValue } from "@earendil-works/chord";
import { apply, type Op } from "@earendil-works/chord/delta";
import {
  StorageRejected,
  type ConversationId,
  type ConversationQuery,
  type ConversationRecord,
  type Cursor,
  type DocumentAddress,
  type DocumentContent,
  type DocumentCopySource,
  type DocumentCreate,
  type DocumentId,
  type DocumentPoint,
  type DocumentQuery,
  type DocumentRecord,
  type EntryId,
  type EntryQuery,
  type EntryRecord,
  type Id,
  type JsonObject,
  type Page,
  type ScanOrder,
  type Seq,
  type Storage,
  type StorageWrite,
  type StoredDocument,
  type SubmissionId,
  type SubmissionQuery,
  type SubmissionRecord,
  type TaskId,
  type TaskQuery,
  type TaskRecord,
} from "@earendil-works/pi-durable";
import { sql, type SQL } from "drizzle-orm";
import { query, type Database, type Executor } from "#server/db/index.ts";
import { migrateDurableSchema, durableTable } from "./postgres-schema.ts";

type AnyTaskRecord = TaskRecord<JsonValue, JsonValue, JsonValue>;
type RecordType = "conversation" | "entry" | "task" | "submission" | "document";
type DocumentScope = DocumentRecord["scope"];

interface DocumentAction {
  create?: DocumentCreate;
  content?: DocumentContent;
  copy?: DocumentCopySource;
  retire: boolean;
}

interface Revision {
  seq: unknown;
  kind: "base" | "delta";
  version: number;
  content: string;
}

export interface PostgresStorageOptions {
  /** Postgres schema holding the tables; one storage owns it at a time. */
  schema?: string;
}

const asId = <I extends Id<string>>(value: unknown): I => Number(value) as I;
const asSeq = (value: unknown): Seq => Number(value) as Seq;

// Records are kept as JSON text rather than jsonb: jsonb rejects the \u0000 and lone-surrogate escapes records may hold.
const encodeJson = (value: unknown): string => JSON.stringify(value);
const parseJson = <T>(value: string): T => JSON.parse(value) as T;
const encodeIndexedString = (value: string): string => JSON.stringify(value);

function scanStart(
  requested: ScanOrder | undefined,
  cursor: Cursor | undefined,
  fallback: ScanOrder,
): { order: ScanOrder; after: number | undefined } {
  if (requested !== undefined && requested !== "ascending" && requested !== "descending") {
    throw new TypeError(`Invalid scan order: ${String(requested)}`);
  }
  if (cursor === undefined) return { order: requested ?? fallback, after: undefined };
  const { after, order: stored } = cursor;
  if (typeof after !== "number" || !Number.isSafeInteger(after)) {
    throw new TypeError("Invalid storage cursor");
  }
  if (stored !== undefined && stored !== "ascending" && stored !== "descending") {
    throw new TypeError("Invalid storage cursor");
  }
  const order = stored ?? fallback;
  if (requested !== undefined && requested !== order) {
    throw new TypeError(`The cursor continues a ${order} scan; the query asks for ${requested}`);
  }
  return { order, after };
}

function page<T extends { id: number }>(
  values: T[],
  limit: number,
  order: ScanOrder = "ascending",
): Page<T, Cursor> {
  const items = values.slice(0, limit);
  if (values.length <= limit) return { items };
  return { items, next: { after: items.at(-1)!.id, order } };
}

function scanSql(start: { order: ScanOrder; after: number | undefined }) {
  if (start.order === "ascending") {
    return { clause: sql`id > ${start.after ?? -1}`, direction: sql.raw("ASC") };
  }
  return {
    clause: sql`id < ${start.after ?? Number.MAX_SAFE_INTEGER}`,
    direction: sql.raw("DESC"),
  };
}

function scopeColumns(scope: DocumentScope): { scopeKind: DocumentScope["kind"]; ownerId: number } {
  switch (scope.kind) {
    case "session":
      return { scopeKind: "session", ownerId: 0 };
    case "conversation":
      return { scopeKind: "conversation", ownerId: scope.conversationId };
    case "task":
      return { scopeKind: "task", ownerId: scope.taskId };
  }
}

function addressParts(address: DocumentAddress) {
  return {
    kind: encodeIndexedString(address.kind),
    ...scopeColumns(address.scope),
    family: address.key !== undefined,
    keyValue: encodeIndexedString(address.key ?? ""),
  };
}

function addressKey(address: DocumentAddress): string {
  const parts = addressParts(address);
  return JSON.stringify([parts.kind, parts.scopeKind, parts.ownerId, parts.family, parts.keyValue]);
}

function isAliveAt(record: DocumentRecord, at: DocumentPoint): boolean {
  if (at === "current") return record.retiredAt === undefined;
  return record.createdAt <= at && (record.retiredAt === undefined || at < record.retiredAt);
}

function isCurrentOnly(record: DocumentRecord): boolean {
  return record.scope.kind !== "conversation" || record.history === "latest";
}

function writeId(write: StorageWrite): number | undefined {
  switch (write.type) {
    case "conversation":
    case "entry":
    case "task":
    case "submission":
      return write.value.id;
    case "document.create":
    case "document.copy":
      return write.record.id;
    case "document.change":
    case "document.retire":
      return undefined;
  }
}

/** Postgres implementation of pi-durable's storage contract, after its SQLite backend. */
export class PostgresStorage implements Storage {
  private closed = false;
  private closing: Promise<void> | undefined;
  private admittedReads = 0;
  private readsDrained: (() => void) | undefined;
  private commits: Promise<unknown> = Promise.resolve();

  private constructor(
    private readonly db: Database,
    private readonly schema: string,
    private nextId: number,
  ) {}

  /** Migrates the schema and opens storage over it; the database stays the caller's to close. */
  static async open(db: Database, options: PostgresStorageOptions = {}): Promise<PostgresStorage> {
    const schema = options.schema ?? "durable";
    await migrateDurableSchema(db, schema);
    const [metadata] = await query<{ next_id: unknown }>(
      sql`SELECT next_id FROM ${durableTable(schema, "durable_metadata")} WHERE singleton = 1`,
      db,
    );
    if (metadata === undefined) throw new Error("Durable Postgres metadata is missing");
    return new PostgresStorage(db, schema, Number(metadata.next_id));
  }

  async commit(writes: readonly StorageWrite[], _context: Context): Promise<Seq> {
    this.assertOpen();
    const committed = this.commits.then(() => this.applyCommit(writes));
    this.commits = committed.catch(() => undefined);
    return committed;
  }

  async mintId<I extends Id<string>>(): Promise<I> {
    this.assertOpen();
    if (!Number.isSafeInteger(this.nextId)) throw new Error("ID space is exhausted");
    return asId<I>(this.nextId++);
  }

  conversation(id: ConversationId, _context: Context): Promise<ConversationRecord | undefined> {
    return this.admitRead(() => this.readConversation(id));
  }

  scanConversations(
    filter: ConversationQuery,
    limit: number,
    cursor: Cursor | undefined,
    _context: Context,
  ): Promise<Page<ConversationRecord, Cursor>> {
    return this.admitRead(async () => {
      const start = scanStart(filter.order, cursor, "ascending");
      const scan = scanSql(start);
      const clauses = [scan.clause];
      if (filter.ownerConversationId !== undefined) {
        clauses.push(sql`owner_conversation_id = ${filter.ownerConversationId}`);
      }
      if (filter.ownerTaskId !== undefined) {
        clauses.push(sql`owner_task_id = ${filter.ownerTaskId}`);
      }
      const records = await this.records<ConversationRecord>(
        sql`SELECT record FROM ${this.table("conversations")} WHERE ${sql.join(clauses, sql` AND `)}
          ORDER BY id ${scan.direction} LIMIT ${limit + 1}`,
      );
      return page(records, limit, start.order);
    });
  }

  entry(
    id: EntryId,
    context: Context,
  ): Promise<{ readonly entry: EntryRecord; readonly commitSeq: Seq } | undefined>;
  entry(
    conversationId: ConversationId,
    id: EntryId,
    context: Context,
  ): Promise<{ readonly entry: EntryRecord; readonly commitSeq: Seq } | undefined>;
  entry(first: number, second: unknown, third?: Context) {
    return this.admitRead(() => {
      if (third === undefined) return this.readEntry(asId<EntryId>(first), undefined);
      if (typeof second !== "number") throw new TypeError("Storage.entry() requires an entry ID");
      return this.readEntry(asId<EntryId>(second), asId<ConversationId>(first));
    });
  }

  findLatestHeadMarker(
    conversationId: ConversationId,
    atOrBeforeEntryId: EntryId | undefined,
    _context: Context,
  ): Promise<(EntryRecord & { readonly head: EntryId }) | undefined> {
    return this.admitRead(() => this.readLatestHeadMarker(conversationId, atOrBeforeEntryId));
  }

  scanEntries(
    filter: EntryQuery,
    limit: number,
    cursor: Cursor | undefined,
    _context: Context,
  ): Promise<Page<EntryRecord, Cursor>> {
    return this.admitRead(() => this.readEntries(filter, limit, cursor));
  }

  task(id: TaskId, _context: Context): Promise<AnyTaskRecord | undefined> {
    return this.admitRead(() =>
      this.record<AnyTaskRecord>(sql`SELECT record FROM ${this.table("tasks")} WHERE id = ${id}`),
    );
  }

  scanTasks(
    filter: TaskQuery,
    limit: number,
    cursor: Cursor | undefined,
    _context: Context,
  ): Promise<Page<AnyTaskRecord, Cursor>> {
    return this.admitRead(async () => {
      const start = scanStart(filter.order, cursor, "ascending");
      const scan = scanSql(start);
      const clauses = [scan.clause];
      if (filter.conversationId !== undefined) {
        clauses.push(sql`conversation_id = ${filter.conversationId}`);
      }
      if (filter.kind !== undefined) clauses.push(sql`kind = ${encodeIndexedString(filter.kind)}`);
      if (filter.status !== undefined) clauses.push(sql`status = ${filter.status}`);
      if (filter.abortRequested !== undefined) {
        clauses.push(sql`abort_requested = ${filter.abortRequested}`);
      }
      if (filter.background !== undefined) clauses.push(sql`background = ${filter.background}`);
      const records = await this.records<AnyTaskRecord>(
        sql`SELECT record FROM ${this.table("tasks")} WHERE ${sql.join(clauses, sql` AND `)}
          ORDER BY id ${scan.direction} LIMIT ${limit + 1}`,
      );
      return page(records, limit, start.order);
    });
  }

  submission(id: SubmissionId, _context: Context): Promise<SubmissionRecord | undefined> {
    return this.admitRead(() =>
      this.record<SubmissionRecord>(
        sql`SELECT record FROM ${this.table("submissions")} WHERE id = ${id}`,
      ),
    );
  }

  scanSubmissions(
    filter: SubmissionQuery,
    limit: number,
    cursor: Cursor | undefined,
    _context: Context,
  ): Promise<Page<SubmissionRecord, Cursor>> {
    return this.admitRead(async () => {
      const start = scanStart(filter.order, cursor, "ascending");
      const scan = scanSql(start);
      const clauses = [scan.clause];
      if (filter.conversationId !== undefined) {
        clauses.push(sql`conversation_id = ${filter.conversationId}`);
      }
      if (filter.status !== undefined) clauses.push(sql`status = ${filter.status}`);
      const records = await this.records<SubmissionRecord>(
        sql`SELECT record FROM ${this.table("submissions")} WHERE ${sql.join(clauses, sql` AND `)}
          ORDER BY id ${scan.direction} LIMIT ${limit + 1}`,
      );
      return page(records, limit, start.order);
    });
  }

  submissionByRequest(
    conversationId: ConversationId,
    requestId: string,
    _context: Context,
  ): Promise<SubmissionRecord | undefined> {
    return this.admitRead(() =>
      this.record<SubmissionRecord>(
        sql`SELECT record FROM ${this.table("submissions")}
          WHERE conversation_id = ${conversationId} AND request_id = ${encodeIndexedString(requestId)}`,
      ),
    );
  }

  findDocument(
    address: DocumentAddress,
    at: DocumentPoint,
    _context: Context,
  ): Promise<DocumentRecord | undefined> {
    return this.admitRead(() => {
      const parts = addressParts(address);
      const alive =
        at === "current"
          ? sql`retired_at IS NULL`
          : sql`created_at <= ${at} AND (retired_at IS NULL OR retired_at > ${at})`;
      return this.record<DocumentRecord>(
        sql`SELECT record FROM ${this.table("documents")}
          WHERE kind = ${parts.kind} AND scope_kind = ${parts.scopeKind} AND owner_id = ${parts.ownerId}
          AND family = ${parts.family} AND key_value = ${parts.keyValue} AND ${alive}
          ORDER BY created_at DESC LIMIT 1`,
      );
    });
  }

  document(
    id: DocumentId,
    at: DocumentPoint,
    _context: Context,
  ): Promise<StoredDocument | undefined> {
    // The record and revision queries must observe one committed state; a commit between them can replace the base.
    return this.admitRead(() =>
      this.db.transaction((tx) => this.materializeDocument(tx, id, at), {
        isolationLevel: "repeatable read",
        accessMode: "read only",
      }),
    );
  }

  scanDocuments(
    filter: DocumentQuery,
    limit: number,
    cursor: Cursor | undefined,
    _context: Context,
  ): Promise<Page<DocumentRecord, Cursor>> {
    return this.admitRead(async () => {
      const after = cursor?.after;
      if (after !== undefined && (typeof after !== "number" || !Number.isSafeInteger(after))) {
        throw new TypeError("Invalid storage cursor");
      }
      const scope = scopeColumns(filter.scope);
      const clauses = [
        sql`scope_kind = ${scope.scopeKind}`,
        sql`owner_id = ${scope.ownerId}`,
        sql`id > ${after ?? -1}`,
      ];
      if (filter.kind !== undefined) clauses.push(sql`kind = ${encodeIndexedString(filter.kind)}`);
      if (filter.at === "current") {
        clauses.push(sql`retired_at IS NULL`);
      } else {
        clauses.push(
          sql`created_at <= ${filter.at}`,
          sql`(retired_at IS NULL OR retired_at > ${filter.at})`,
        );
      }
      const records = await this.records<DocumentRecord>(
        sql`SELECT record FROM ${this.table("documents")} WHERE ${sql.join(clauses, sql` AND `)}
          ORDER BY id LIMIT ${limit + 1}`,
      );
      return page(records, limit);
    });
  }

  close(_context: Context): Promise<void> {
    if (this.closing === undefined) {
      this.closed = true;
      this.closing = this.drain();
    }
    return this.closing;
  }

  private async drain(): Promise<void> {
    if (this.admittedReads > 0) {
      await new Promise<void>((resolve) => {
        this.readsDrained = resolve;
      });
    }
    await this.commits;
  }

  /** Runs a read; close waits for admitted reads, so none outlives the storage. */
  private async admitRead<T>(read: () => Promise<T>): Promise<T> {
    this.assertOpen();
    this.admittedReads++;
    try {
      return await read();
    } finally {
      if (--this.admittedReads === 0) this.readsDrained?.();
    }
  }

  private assertOpen(): void {
    if (this.closed) throw new Error("PostgresStorage is closed");
  }

  private table(name: string): SQL {
    return durableTable(this.schema, name);
  }

  private async records<T>(statement: SQL, executor: Executor = this.db): Promise<T[]> {
    const rows = await query<{ record: string }>(statement, executor);
    return rows.map((row) => parseJson<T>(row.record));
  }

  private async record<T>(statement: SQL, executor: Executor = this.db): Promise<T | undefined> {
    const [record] = await this.records<T>(statement, executor);
    return record;
  }

  private readConversation(
    id: ConversationId,
    executor: Executor = this.db,
  ): Promise<ConversationRecord | undefined> {
    return this.record<ConversationRecord>(
      sql`SELECT record FROM ${this.table("conversations")} WHERE id = ${id}`,
      executor,
    );
  }

  private async readEntry(
    id: EntryId,
    throughConversationId: ConversationId | undefined,
  ): Promise<{ entry: EntryRecord; commitSeq: Seq } | undefined> {
    let conversation: ConversationRecord | undefined;
    if (throughConversationId !== undefined) {
      conversation = await this.readConversation(throughConversationId);
      if (conversation === undefined) {
        throw new Error(`Unknown conversation: ${throughConversationId}`);
      }
    }
    const [row] = await query<{ record: string; commit_seq: unknown }>(
      sql`SELECT record, commit_seq FROM ${this.table("entries")} WHERE id = ${id}`,
      this.db,
    );
    if (row === undefined) return undefined;
    const entry = parseJson<EntryRecord>(row.record);
    if (conversation !== undefined) {
      let upperEntryId = Number.POSITIVE_INFINITY;
      while (conversation.id !== entry.conversationId) {
        if (conversation.parent === undefined) return undefined;
        upperEntryId = Math.min(upperEntryId, conversation.parent.at);
        conversation = (await this.readConversation(conversation.parent.conversationId))!;
      }
      if (entry.id > upperEntryId) return undefined;
    }
    return { entry, commitSeq: asSeq(row.commit_seq) };
  }

  private async readLatestHeadMarker(
    conversationId: ConversationId,
    atOrBeforeEntryId: EntryId | undefined,
  ): Promise<(EntryRecord & { readonly head: EntryId }) | undefined> {
    let conversation = await this.readConversation(conversationId);
    if (conversation === undefined) throw new Error(`Unknown conversation: ${conversationId}`);
    let upper: number | undefined = atOrBeforeEntryId;
    while (true) {
      const bound = upper === undefined ? sql`TRUE` : sql`id <= ${upper}`;
      const marker = await this.record<EntryRecord & { head: EntryId }>(
        sql`SELECT record FROM ${this.table("entries")}
          WHERE conversation_id = ${conversation.id} AND head IS NOT NULL AND ${bound}
          ORDER BY id DESC LIMIT 1`,
      );
      if (marker !== undefined) return marker;
      if (conversation.parent === undefined) return undefined;
      upper =
        upper === undefined ? conversation.parent.at : Math.min(upper, conversation.parent.at);
      conversation = (await this.readConversation(conversation.parent.conversationId))!;
    }
  }

  private async readEntries(
    filter: EntryQuery,
    limit: number,
    cursor: Cursor | undefined,
  ): Promise<Page<EntryRecord, Cursor>> {
    const { order, after } = scanStart(filter.order, cursor, "descending");
    if (order === "ascending") return this.readEntriesAscending(filter, limit, after);

    let conversation = await this.readConversation(filter.conversationId);
    if (conversation === undefined) {
      throw new Error(`Unknown conversation: ${filter.conversationId}`);
    }
    let upper: number | undefined = filter.maxEntryId;
    if (after !== undefined) upper = Math.min(upper ?? Number.MAX_SAFE_INTEGER, after - 1);
    const values: EntryRecord[] = [];
    while (true) {
      const clauses = [sql`conversation_id = ${conversation.id}`];
      if (filter.minEntryId !== undefined) clauses.push(sql`id >= ${filter.minEntryId}`);
      if (upper !== undefined) clauses.push(sql`id <= ${upper}`);
      values.push(
        ...(await this.records<EntryRecord>(
          sql`SELECT record FROM ${this.table("entries")} WHERE ${sql.join(clauses, sql` AND `)}
            ORDER BY id DESC LIMIT ${limit + 1 - values.length}`,
        )),
      );
      if (values.length > limit || conversation.parent === undefined) break;
      upper =
        upper === undefined ? conversation.parent.at : Math.min(upper, conversation.parent.at);
      if (filter.minEntryId !== undefined && upper < filter.minEntryId) break;
      conversation = (await this.readConversation(conversation.parent.conversationId))!;
    }
    return page(values, limit, "descending");
  }

  /** Oldest first: the fork chain's segments from the root conversation forward, each up to its fork point. */
  private async readEntriesAscending(
    filter: EntryQuery,
    limit: number,
    after: number | undefined,
  ): Promise<Page<EntryRecord, Cursor>> {
    const segments: { conversationId: ConversationId; upper: number | undefined }[] = [];
    let conversation = await this.readConversation(filter.conversationId);
    if (conversation === undefined) {
      throw new Error(`Unknown conversation: ${filter.conversationId}`);
    }
    let upper: number | undefined = filter.maxEntryId;
    while (true) {
      segments.push({ conversationId: conversation.id, upper });
      if (conversation.parent === undefined) break;
      upper =
        upper === undefined ? conversation.parent.at : Math.min(upper, conversation.parent.at);
      if (filter.minEntryId !== undefined && upper < filter.minEntryId) break;
      conversation = (await this.readConversation(conversation.parent.conversationId))!;
    }

    let lower: number | undefined = filter.minEntryId;
    if (after !== undefined) lower = Math.max(lower ?? after + 1, after + 1);
    const values: EntryRecord[] = [];
    for (const segment of segments.reverse()) {
      const clauses = [sql`conversation_id = ${segment.conversationId}`];
      if (lower !== undefined) clauses.push(sql`id >= ${lower}`);
      if (segment.upper !== undefined) clauses.push(sql`id <= ${segment.upper}`);
      values.push(
        ...(await this.records<EntryRecord>(
          sql`SELECT record FROM ${this.table("entries")} WHERE ${sql.join(clauses, sql` AND `)}
            ORDER BY id ASC LIMIT ${limit + 1 - values.length}`,
        )),
      );
      if (values.length > limit) break;
    }
    return page(values, limit, "ascending");
  }

  private async materializeDocument(
    executor: Executor,
    id: DocumentId,
    at: DocumentPoint,
  ): Promise<StoredDocument | undefined> {
    const record = await this.record<DocumentRecord>(
      sql`SELECT record FROM ${this.table("documents")} WHERE id = ${id}`,
      executor,
    );
    if (record === undefined) return undefined;
    if (at !== "current" && isCurrentOnly(record)) {
      throw new Error(`Document ${id} does not retain historical content`);
    }
    if (!isAliveAt(record, at)) return undefined;

    const upper = at === "current" ? Number.MAX_SAFE_INTEGER : at;
    const [base] = await query<Revision>(
      sql`SELECT seq, kind, version, content FROM ${this.table("document_revisions")}
        WHERE document_id = ${id} AND kind = 'base' AND seq <= ${upper} ORDER BY seq DESC LIMIT 1`,
      executor,
    );
    if (base === undefined) throw new Error(`Document ${id} is missing a required base`);
    let value = parseJson<JsonObject>(base.content);
    const tail = await query<Revision>(
      sql`SELECT seq, kind, version, content FROM ${this.table("document_revisions")}
        WHERE document_id = ${id} AND seq > ${Number(base.seq)} AND seq <= ${upper} ORDER BY seq`,
      executor,
    );
    for (const revision of tail) {
      if (revision.kind !== "delta" || revision.version !== base.version) {
        throw new Error(`Document ${id} crosses a stored version boundary without a base`);
      }
      value = apply(value, parseJson<Op[]>(revision.content)) as JsonObject;
    }
    return { record, version: base.version, value, deltasSinceBase: tail.length };
  }

  private async applyCommit(writes: readonly StorageWrite[]): Promise<Seq> {
    const documentActions = this.prepareDocumentActions(writes);
    const candidateNextId = this.candidateNextId(writes);
    const seq = await this.db.transaction(async (tx) => {
      const [metadata] = await query<{ next_id: unknown; next_seq: unknown }>(
        sql`SELECT next_id, next_seq FROM ${this.table("durable_metadata")}
          WHERE singleton = 1 FOR UPDATE`,
        tx,
      );
      if (metadata === undefined) throw new Error("Durable Postgres metadata is missing");
      const committedSeq = asSeq(metadata.next_seq);
      await this.checkGlobalIds(tx, writes);
      await this.checkDocumentActions(tx, documentActions);
      for (const write of writes) await this.applyTableWrite(tx, write, committedSeq);
      await this.applyDocumentActions(tx, documentActions, committedSeq);
      await tx.execute(
        sql`UPDATE ${this.table("durable_metadata")}
          SET next_id = ${Math.max(Number(metadata.next_id), candidateNextId)}, next_seq = ${committedSeq + 1}
          WHERE singleton = 1`,
      );
      return committedSeq;
    });
    this.nextId = Math.max(this.nextId, candidateNextId);
    return seq;
  }

  private candidateNextId(writes: readonly StorageWrite[]): number {
    let nextId = this.nextId;
    for (const write of writes) {
      const id = writeId(write);
      if (id !== undefined) nextId = Math.max(nextId, id + 1);
    }
    return nextId;
  }

  private async checkGlobalIds(executor: Executor, writes: readonly StorageWrite[]): Promise<void> {
    const claimed = new Map<number, RecordType>();
    for (const write of writes) {
      if (write.type === "document.change" || write.type === "document.retire") continue;
      const isDocument = write.type === "document.create" || write.type === "document.copy";
      const type: RecordType = isDocument ? "document" : write.type;
      const id = isDocument ? write.record.id : write.value.id;
      const [row] = await query<{ record_type: RecordType }>(
        sql`SELECT record_type FROM ${this.table("record_ids")} WHERE id = ${id}`,
        executor,
      );
      const existing = row?.record_type;
      const earlier = claimed.get(id);
      if (type === "conversation" || type === "entry" || type === "document") {
        if (existing !== undefined) throw new Error(`ID ${id} already belongs to ${existing}`);
        if (earlier !== undefined) throw new Error(`ID ${id} is written more than once`);
      } else {
        if (existing !== undefined && existing !== type) {
          throw new Error(`ID ${id} already belongs to ${existing}`);
        }
        if (earlier !== undefined && earlier !== type) {
          throw new Error(`ID ${id} is written as two record types`);
        }
      }
      claimed.set(id, type);
    }
  }

  private prepareDocumentActions(writes: readonly StorageWrite[]): Map<DocumentId, DocumentAction> {
    const actions = new Map<DocumentId, DocumentAction>();
    for (const write of writes) {
      if (
        write.type !== "document.create" &&
        write.type !== "document.copy" &&
        write.type !== "document.change" &&
        write.type !== "document.retire"
      ) {
        continue;
      }
      const id =
        write.type === "document.create" || write.type === "document.copy"
          ? write.record.id
          : write.id;
      let action = actions.get(id);
      if (action === undefined) {
        action = { retire: false };
        actions.set(id, action);
      }
      switch (write.type) {
        case "document.create":
          if (
            action.create !== undefined ||
            action.content !== undefined ||
            action.copy !== undefined
          ) {
            throw new Error(`Document ${id} has more than one content command`);
          }
          action.create = write.record;
          action.content = write.content;
          break;
        case "document.copy":
          if (
            action.create !== undefined ||
            action.content !== undefined ||
            action.copy !== undefined
          ) {
            throw new Error(`Document ${id} has more than one content command`);
          }
          action.create = write.record;
          action.copy = write.source;
          break;
        case "document.change":
          if (action.content !== undefined || action.copy !== undefined) {
            throw new Error(`Document ${id} has more than one content command`);
          }
          action.content = write.content;
          break;
        case "document.retire":
          if (action.retire) throw new Error(`Document ${id} is retired more than once`);
          action.retire = true;
          break;
      }
    }
    return actions;
  }

  private async checkDocumentActions(
    executor: Executor,
    actions: Map<DocumentId, DocumentAction>,
  ): Promise<void> {
    const liveCounts = new Map<string, number>();
    for (const [id, action] of actions) {
      if (action.copy !== undefined && actions.has(action.copy.id)) {
        throw new StorageRejected(`Document copy ${id} source is changed in the copy batch`);
      }
      const existing = await this.record<DocumentRecord>(
        sql`SELECT record FROM ${this.table("documents")} WHERE id = ${id}`,
        executor,
      );
      if (action.create === undefined && existing === undefined) {
        throw new Error(`Unknown document: ${id}`);
      }
      if (action.create !== undefined && existing !== undefined) {
        throw new Error(`Document ${id} already exists`);
      }
      if (existing?.retiredAt !== undefined) throw new Error(`Document ${id} is retired`);
      if (action.content?.kind === "delta") {
        const [previous] = await query<{ version: number }>(
          sql`SELECT version FROM ${this.table("document_revisions")}
            WHERE document_id = ${id} ORDER BY seq DESC LIMIT 1`,
          executor,
        );
        if (previous === undefined) throw new Error(`Document ${id} delta has no base`);
        if (previous.version !== action.content.version) {
          throw new Error(`Document ${id} version transition requires a base`);
        }
      }

      const record: DocumentAddress = (action.create ?? existing)!;
      const key = addressKey(record);
      let live = liveCounts.get(key);
      if (live === undefined) live = (await this.hasCurrentDocument(executor, record)) ? 1 : 0;
      if (action.retire && existing !== undefined) live--;
      if (action.create !== undefined && !action.retire) live++;
      liveCounts.set(key, live);
    }
    for (const live of liveCounts.values()) {
      if (live > 1) throw new Error("Document address already has a current incarnation");
    }
  }

  private async hasCurrentDocument(executor: Executor, address: DocumentAddress): Promise<boolean> {
    const parts = addressParts(address);
    const rows = await query<{ id: unknown }>(
      sql`SELECT id FROM ${this.table("documents")}
        WHERE kind = ${parts.kind} AND scope_kind = ${parts.scopeKind} AND owner_id = ${parts.ownerId}
        AND family = ${parts.family} AND key_value = ${parts.keyValue} AND retired_at IS NULL
        LIMIT 1`,
      executor,
    );
    return rows.length > 0;
  }

  private async applyTableWrite(executor: Executor, write: StorageWrite, seq: Seq): Promise<void> {
    switch (write.type) {
      case "conversation": {
        const { value } = write;
        await this.claimId(executor, value.id, "conversation");
        await executor.execute(
          sql`INSERT INTO ${this.table("conversations")} (id, owner_conversation_id, owner_task_id, record)
            VALUES (${value.id}, ${value.owner?.conversationId ?? null}, ${value.owner?.taskId ?? null},
            ${encodeJson(value)})`,
        );
        break;
      }
      case "entry": {
        const { value } = write;
        await this.claimId(executor, value.id, "entry");
        await executor.execute(
          sql`INSERT INTO ${this.table("entries")} (id, conversation_id, head, commit_seq, record)
            VALUES (${value.id}, ${value.conversationId}, ${value.head ?? null}, ${seq}, ${encodeJson(value)})`,
        );
        break;
      }
      case "task": {
        const { value } = write;
        await this.claimId(executor, value.id, "task");
        await executor.execute(
          sql`INSERT INTO ${this.table("tasks")}
            (id, conversation_id, kind, status, abort_requested, background, record)
            VALUES (${value.id}, ${value.conversationId}, ${encodeIndexedString(value.kind)},
            ${value.state.status}, ${value.abortRequested}, ${value.background}, ${encodeJson(value)})
            ON CONFLICT (id) DO UPDATE SET conversation_id = EXCLUDED.conversation_id,
            kind = EXCLUDED.kind, status = EXCLUDED.status, abort_requested = EXCLUDED.abort_requested,
            background = EXCLUDED.background, record = EXCLUDED.record`,
        );
        break;
      }
      case "submission": {
        const { value } = write;
        const requestId =
          value.requestId === undefined ? null : encodeIndexedString(value.requestId);
        await this.claimId(executor, value.id, "submission");
        await executor.execute(
          sql`INSERT INTO ${this.table("submissions")} (id, conversation_id, request_id, status, record)
            VALUES (${value.id}, ${value.conversationId}, ${requestId}, ${value.status}, ${encodeJson(value)})
            ON CONFLICT (id) DO UPDATE SET conversation_id = EXCLUDED.conversation_id,
            request_id = EXCLUDED.request_id, status = EXCLUDED.status, record = EXCLUDED.record`,
        );
        break;
      }
      case "document.create":
      case "document.copy":
      case "document.change":
      case "document.retire":
        break;
    }
  }

  private async claimId(executor: Executor, id: number, type: RecordType): Promise<void> {
    await executor.execute(
      sql`INSERT INTO ${this.table("record_ids")} (id, record_type) VALUES (${id}, ${type})
        ON CONFLICT (id) DO NOTHING`,
    );
  }

  private async applyDocumentActions(
    executor: Executor,
    actions: Map<DocumentId, DocumentAction>,
    seq: Seq,
  ): Promise<void> {
    for (const [id, action] of actions) {
      let content = action.content;
      if (action.copy !== undefined) {
        content = await this.copiedContent(executor, id, action.copy, action.create!);
      }

      let record: DocumentRecord;
      if (action.create !== undefined) {
        record = {
          ...action.create,
          createdAt: seq,
          ...(action.retire ? { retiredAt: seq } : {}),
        } as DocumentRecord;
        const parts = addressParts(record);
        await this.claimId(executor, id, "document");
        await executor.execute(
          sql`INSERT INTO ${this.table("documents")}
            (id, kind, family, key_value, scope_kind, owner_id, created_at, retired_at, record)
            VALUES (${id}, ${parts.kind}, ${parts.family}, ${parts.keyValue}, ${parts.scopeKind},
            ${parts.ownerId}, ${seq}, ${action.retire ? seq : null}, ${encodeJson(record)})`,
        );
      } else {
        record = (await this.record<DocumentRecord>(
          sql`SELECT record FROM ${this.table("documents")} WHERE id = ${id}`,
          executor,
        ))!;
      }

      if (content !== undefined) {
        if (content.kind === "base" && isCurrentOnly(record)) {
          await this.deleteRevisions(executor, id);
        }
        const encoded =
          content.kind === "base" ? encodeJson(content.value) : encodeJson(content.ops);
        await executor.execute(
          sql`INSERT INTO ${this.table("document_revisions")} (document_id, seq, kind, version, content)
            VALUES (${id}, ${seq}, ${content.kind}, ${content.version}, ${encoded})`,
        );
      }

      if (action.retire) {
        if (action.create === undefined) {
          record = { ...record, retiredAt: seq };
          await executor.execute(
            sql`UPDATE ${this.table("documents")} SET retired_at = ${seq}, record = ${encodeJson(record)}
              WHERE id = ${id}`,
          );
        }
        if (isCurrentOnly(record)) await this.deleteRevisions(executor, id);
      }
    }
  }

  private async copiedContent(
    executor: Executor,
    id: DocumentId,
    source: DocumentCopySource,
    create: DocumentCreate,
  ): Promise<DocumentContent> {
    try {
      const stored = await this.materializeDocument(executor, source.id, source.at);
      if (stored === undefined) {
        throw new Error(`Fork source document ${source.id} cannot be read`);
      }
      if (
        stored.record.scope.kind !== "conversation" ||
        create.scope.kind !== "conversation" ||
        stored.record.kind !== create.kind ||
        stored.record.key !== create.key ||
        stored.record.history !== create.history ||
        stored.record.fork !== create.fork
      ) {
        throw new Error(`Fork source document ${source.id} does not match the copied record`);
      }
      return { kind: "base", version: stored.version, value: stored.value };
    } catch (error) {
      if (error instanceof StorageRejected) throw error;
      throw new StorageRejected(`Document copy ${id} was rejected`, { cause: error });
    }
  }

  private async deleteRevisions(executor: Executor, id: DocumentId): Promise<void> {
    await executor.execute(
      sql`DELETE FROM ${this.table("document_revisions")} WHERE document_id = ${id}`,
    );
  }
}
