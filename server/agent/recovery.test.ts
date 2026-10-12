import { afterEach, expect, spyOn, test } from "bun:test";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels, fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai";
import type { Client } from "discord.js";
import { eq, sql } from "drizzle-orm";
import { db } from "#server/db/index.ts";
import { conversations, messages } from "#server/db/schema.ts";
import * as discordClient from "#server/discord/client.ts";
import * as discordMessages from "#server/discord/messages.ts";
import { openHarness } from "#server/durable/harness.ts";
import { PostgresStorage } from "#server/durable/postgres-storage.ts";
import { model } from "./model.ts";
import { finishInterruptedTurns } from "./recovery.ts";
import { useFauxModel } from "./testing.ts";
import { writeTurn, type Turn } from "./turn-context.ts";

const context = BACKGROUND_CONTEXT;
const faux = useFauxModel();
const cleanups: (() => Promise<unknown>)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

/**
 * Starts a turn in one Harness and stops that Harness while the model is still
 * answering, the way a restart would, leaving the schema for the next process.
 */
async function interruptedTurn(turn: Omit<Turn, "context">, text: string) {
  const schema = `durable_test_${crypto.randomUUID().replaceAll("-", "")}`;
  cleanups.push(() => db.execute(sql`DROP SCHEMA IF EXISTS ${sql.identifier(schema)} CASCADE`));

  const slow = fauxProvider({
    provider: model.provider,
    models: [{ id: model.id }],
    tokensPerSecond: 20,
  });
  slow.setResponses([fauxAssistantMessage("an answer the restart cuts short ".repeat(20))]);
  const slowModels = createModels();
  slowModels.setProvider(slow.provider);
  const first = await openHarness(await PostgresStorage.open(db, { schema }), slowModels);

  const [row] = await db
    .insert(conversations)
    .values({ interfaceType: turn.discordChannelId ? "discord" : "http" })
    .returning();
  cleanups.push(() => db.delete(conversations).where(eq(conversations.id, row!.id)));
  const durable = await first.createConversation(
    {
      ownership: { kind: "ownerless" },
      agent: { model: { provider: model.provider, modelId: model.id } },
    },
    context,
  );
  await db
    .update(conversations)
    .set({ durableConversationId: durable.id })
    .where(eq(conversations.id, row!.id));
  await durable.commit((tx) => writeTurn(tx, durable.id, { ...turn, context: {} }), context);
  await durable.submit({ type: "input", content: text }, context);
  while (slow.state.callCount === 0) await new Promise((resolve) => setTimeout(resolve, 5));
  await first.close(context);

  const second = await openHarness(await PostgresStorage.open(db, { schema }));
  cleanups.push(() => second.close(context));
  second.resume();
  return { conversationId: row!.id, harness: second };
}

async function storedMessages(conversationId: string) {
  return db
    .select({ role: messages.role, platformUserId: messages.platformUserId })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.sequence);
}

function captureDiscord(): { channelId: string; text: string }[] {
  const sent: { channelId: string; text: string }[] = [];
  const spies = [
    spyOn(discordClient, "getDiscordClient").mockReturnValue({} as Client),
    spyOn(discordClient, "discordReady").mockResolvedValue(undefined),
    spyOn(discordMessages, "sendDiscordMessageToChannel").mockImplementation(
      async (channelId, text) => {
        sent.push({ channelId, text });
        return true;
      },
    ),
  ];
  cleanups.push(async () => spies.forEach((spy) => spy.mockRestore()));
  return sent;
}

test("a Discord turn cut short by a restart is finished, stored, and answered", async () => {
  const sent = captureDiscord();
  const { conversationId, harness } = await interruptedTurn(
    {
      author: { platformUserId: "U9", appUserId: null },
      hidePrompt: false,
      discordChannelId: "C9",
    },
    "hello",
  );
  faux.setResponses([fauxAssistantMessage("finished after the restart")]);

  await finishInterruptedTurns(harness);

  expect(sent).toEqual([{ channelId: "C9", text: "finished after the restart" }]);
  const rows = await storedMessages(conversationId);
  expect(rows).toEqual([
    { role: "user", platformUserId: "U9" },
    { role: "assistant", platformUserId: null },
  ]);
});

test("a turn nobody waits for is finished and stored, without answering anywhere", async () => {
  const sent = captureDiscord();
  const { conversationId, harness } = await interruptedTurn(
    { author: { platformUserId: null, appUserId: null }, hidePrompt: true },
    "[Webhook — Radarr] Inception has finished downloading.",
  );
  faux.setResponses([fauxAssistantMessage("Inception is ready.")]);

  await finishInterruptedTurns(harness);

  expect(sent).toEqual([]);
  const rows = await storedMessages(conversationId);
  // The prompt nobody typed stays out of the thread.
  expect(rows.map((row) => row.role)).toEqual(["assistant"]);
});
