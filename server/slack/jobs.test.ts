import { afterEach, expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { db } from "#server/db/index.ts";
import { slackEventJobs } from "#server/db/schema.ts";
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
