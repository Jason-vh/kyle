import { afterAll, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "#server/db/index.ts";
import { conversations } from "#server/db/schema.ts";
import { BOT_USER_ID, type SlackEvent } from "./events.ts";
import { isAddressedToKyle } from "./handler.ts";

const channel = `C${crypto.randomUUID().slice(0, 8)}`;
const createdIds: string[] = [];

afterAll(async () => {
  for (const id of createdIds) await db.delete(conversations).where(eq(conversations.id, id));
});

function message(fields: Partial<SlackEvent>): SlackEvent {
  return { type: "message", channel, channel_type: "channel", ts: "2.0", text: "hi", ...fields };
}

test("a DM needs no mention", async () => {
  expect(await isAddressedToKyle(message({ channel_type: "im" }))).toBe(true);
});

test("a channel message needs a mention", async () => {
  expect(await isAddressedToKyle(message({}))).toBe(false);
  expect(await isAddressedToKyle(message({ text: `<@${BOT_USER_ID}> hi` }))).toBe(true);
});

test("a reply in a thread Kyle is part of needs no mention", async () => {
  const [created] = await db
    .insert(conversations)
    .values({ externalId: `${channel}:1.0`, interfaceType: "slack" })
    .returning();
  createdIds.push(created!.id);

  expect(await isAddressedToKyle(message({ thread_ts: "1.0" }))).toBe(true);
});

test("a reply in a thread Kyle was never brought into is left alone", async () => {
  expect(await isAddressedToKyle(message({ thread_ts: "9.0" }))).toBe(false);
});
