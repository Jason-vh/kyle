import { expect, test } from "bun:test";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
  Type,
} from "@earendil-works/pi-ai";
import {
  createRegistry,
  defineExtension,
  defineTool,
  Harness,
  type EntryRecord,
} from "@earendil-works/pi-durable";
import { sql } from "drizzle-orm";
import { db } from "#server/db/index.ts";
import { PostgresStorage } from "./postgres-storage.ts";

const context = BACKGROUND_CONTEXT;

/** Exercises a real Harness, not just the storage contract, against Postgres. */
test("a tool-using run is stored, and survives reopening the harness", async () => {
  const schema = `durable_test_${crypto.randomUUID().replaceAll("-", "")}`;
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  const model = { provider: faux.getModel().provider, modelId: faux.getModel().id };

  const greet = defineTool({
    name: "greet",
    description: "Greet someone by name",
    parameters: Type.Object({ name: Type.String() }),
    execute: async (args) => ({ content: [{ type: "text", text: `Hello, ${args.name}` }] }),
  });
  const registry = createRegistry();
  registry.install(defineExtension({ name: "greeting", tools: [greet] }));

  faux.setResponses([
    fauxAssistantMessage([fauxToolCall("greet", { name: "Kyle" })], { stopReason: "toolUse" }),
    fauxAssistantMessage([fauxText("I said hello.")]),
  ]);

  try {
    const first = await Harness.open(
      await PostgresStorage.open(db, { schema }),
      { models, registry },
      context,
    );
    const root = await first.root(context, { agent: { model } });
    const submission = await root.submit({ type: "input", content: "Say hello to Kyle" }, context);
    expect((await submission.wait(context)).status).toBe("done");
    await first.close(context);

    const second = await Harness.open(
      await PostgresStorage.open(db, { schema }),
      { models, registry },
      context,
    );
    const reopened = await second.root(context);
    const { items } = await reopened.entries({ order: "ascending" }, 100, undefined, context);
    expect(items.map((entry: EntryRecord) => entry.kind)).toEqual([
      "pi.user",
      "pi.system",
      "pi.assistant",
      "pi.tool-result",
      "pi.assistant",
    ]);
    expect(JSON.stringify(items.at(3))).toContain("Hello, Kyle");
    expect(JSON.stringify(items.at(-1))).toContain("I said hello.");
    await second.close(context);
  } finally {
    await db.execute(sql`DROP SCHEMA IF EXISTS ${sql.identifier(schema)} CASCADE`);
  }
});
