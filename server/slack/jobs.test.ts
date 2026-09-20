import { afterEach, expect, spyOn, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { db } from "#server/db/index.ts";
import { conversations, platformIdentities, slackEventJobs } from "#server/db/schema.ts";
import { createTestUser, deleteTestUser } from "#server/db/testing.ts";
import * as agent from "#server/agent/index.ts";
import * as slack from "./client.ts";
import { enqueueSlackEvent, processSlackEvent, processSlackEvents } from "./jobs.ts";
import type { SlackEvent } from "./events.ts";

const eventIds: string[] = [];
const event: SlackEvent = {
  type: "message",
  channel: "C1",
  channel_type: "im",
  user: "U1",
  ts: "1",
  text: "Hello",
};

function eventId() {
  const id = crypto.randomUUID();
  eventIds.push(id);
  return id;
}

async function stored(id: string) {
  return db.query.slackEventJobs.findFirst({ where: eq(slackEventJobs.eventId, id) });
}

afterEach(async () => {
  if (eventIds.length) {
    await db.delete(slackEventJobs).where(inArray(slackEventJobs.eventId, eventIds.splice(0)));
  }
});

test("recovers an acknowledged event that never reached the processor", async () => {
  const id = eventId();
  await enqueueSlackEvent(id, event, "T1");
  expect(await stored(id)).toMatchObject({ attempts: 0, completedAt: null });

  await processSlackEvents(new Date(), async (received, teamId) => {
    expect(received).toEqual(event);
    expect(teamId).toBe("T1");
    return "Recovered";
  });

  expect(await stored(id)).toMatchObject({ attempts: 1, responseText: "Recovered" });
  expect((await stored(id))!.completedAt).not.toBeNull();
});

test("concurrent deliveries preserve the first payload and process only once", async () => {
  const id = eventId();
  await enqueueSlackEvent(id, event, "T1");
  await enqueueSlackEvent(id, { ...event, text: "Changed" }, "T2");
  let calls = 0;
  const processMessage = async (received: SlackEvent) => {
    expect(received).toEqual(event);
    calls++;
    return "Done";
  };

  expect(
    await Promise.all([
      processSlackEvent(id, processMessage),
      processSlackEvent(id, processMessage),
    ]),
  ).toEqual(["Done", "Done"]);
  expect(calls).toBe(1);
  expect((await stored(id))!.attempts).toBe(1);
});

test("failed processing retries after backoff without forgetting the event", async () => {
  const id = eventId();
  await enqueueSlackEvent(id, event);
  await processSlackEvent(id, async () => {
    throw new Error("Slack unavailable");
  });
  const failed = (await stored(id))!;
  expect(failed).toMatchObject({ attempts: 1, completedAt: null, lastError: "Slack unavailable" });
  let calls = 0;
  const processMessage = async () => {
    calls++;
    return "Retried";
  };
  await processSlackEvents(new Date(failed.availableAt.getTime() - 1), processMessage);
  expect(calls).toBe(0);
  await processSlackEvents(failed.availableAt, processMessage);
  expect(calls).toBe(1);
  expect(await stored(id)).toMatchObject({ attempts: 2, responseText: "Retried", lastError: null });
});

test.each([false, true])(
  "retries delivery without rerunning the agent after an agent failure: %s",
  async (agentFails) => {
    const id = eventId();
    const userId = await createTestUser("Slack recovery");
    const platformUserId = crypto.randomUUID();
    await db.insert(platformIdentities).values({ userId, platform: "slack", platformUserId });
    let deliveryFails = true;
    const sent: string[] = [];
    const client = spyOn(slack, "getSlackClient").mockReturnValue({
      users: { info: async () => ({ user: { real_name: "Requester" } }) },
      assistant: { threads: { setStatus: async () => ({ ok: true }) } },
      chat: {
        postMessage: async (input: { markdown_text: string }) => {
          if (deliveryFails) throw new Error("Slack unavailable");
          sent.push(input.markdown_text);
          return { ok: true };
        },
      },
    } as unknown as ReturnType<typeof slack.getSlackClient>);
    const run = spyOn(agent, "runAgent").mockImplementation(async () => {
      if (agentFails) throw new Error("Model unavailable");
      return { messages: [], responseText: "Added your movie." };
    });
    try {
      await enqueueSlackEvent(id, { ...event, user: platformUserId, ts: id });
      await processSlackEvent(id);
      const pending = (await stored(id))!;
      expect(pending.completedAt).toBeNull();
      expect(pending.lastError).toBe("Slack unavailable");
      expect(pending.responseText).toBeTruthy();
      expect(run).toHaveBeenCalledTimes(1);

      deliveryFails = false;
      await processSlackEvent(id, undefined, pending.availableAt);
      expect(sent).toEqual([pending.responseText!]);
      expect(run).toHaveBeenCalledTimes(1);
      expect((await stored(id))!.completedAt).not.toBeNull();
      expect((await stored(id))!.lastError).toBeNull();
    } finally {
      run.mockRestore();
      client.mockRestore();
      await db.delete(conversations).where(eq(conversations.userId, userId));
      await deleteTestUser(userId);
    }
  },
);
