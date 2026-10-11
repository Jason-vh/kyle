import { describe, expect, it } from "bun:test";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { ConversationId } from "@earendil-works/pi-durable";
import { registerStorageConformance } from "@earendil-works/pi-durable/testing";
import { sql } from "drizzle-orm";
import { db } from "#server/db/index.ts";
import { PostgresStorage } from "./postgres-storage.ts";

async function withSchema(use: (schema: string) => Promise<void>): Promise<void> {
  const schema = `durable_test_${crypto.randomUUID().replaceAll("-", "")}`;
  try {
    await use(schema);
  } finally {
    await db.execute(sql`DROP SCHEMA IF EXISTS ${sql.identifier(schema)} CASCADE`);
  }
}

registerStorageConformance({ describe, expect, it }, "PostgresStorage", (use) =>
  withSchema(async (schema) => {
    const storage = await PostgresStorage.open(db, { schema });
    try {
      await use(storage);
    } finally {
      await storage.close(BACKGROUND_CONTEXT);
    }
  }),
);

describe("PostgresStorage across restarts", () => {
  it("reopens with what was committed and keeps minting past it", () =>
    withSchema(async (schema) => {
      const first = await PostgresStorage.open(db, { schema });
      const conversationId = await first.mintId<ConversationId>();
      await first.commit(
        [{ type: "conversation", value: { id: conversationId } }],
        BACKGROUND_CONTEXT,
      );
      await first.close(BACKGROUND_CONTEXT);

      const second = await PostgresStorage.open(db, { schema });
      expect(await second.conversation(conversationId, BACKGROUND_CONTEXT)).toEqual({
        id: conversationId,
      });
      expect(await second.mintId()).toBeGreaterThan(conversationId);
      await second.close(BACKGROUND_CONTEXT);
    }));

  it("finishes commits admitted before close", () =>
    withSchema(async (schema) => {
      const storage = await PostgresStorage.open(db, { schema });
      const ids = [await storage.mintId<ConversationId>(), await storage.mintId<ConversationId>()];
      const commits = ids.map((id) =>
        storage.commit([{ type: "conversation", value: { id } }], BACKGROUND_CONTEXT),
      );
      await storage.close(BACKGROUND_CONTEXT);
      expect((await Promise.all(commits)).map(Number)).toEqual([1, 2]);

      const reopened = await PostgresStorage.open(db, { schema });
      const { items } = await reopened.scanConversations({}, 10, undefined, BACKGROUND_CONTEXT);
      expect(items.map((conversation) => conversation.id)).toEqual(ids);
      await reopened.close(BACKGROUND_CONTEXT);
    }));
});
