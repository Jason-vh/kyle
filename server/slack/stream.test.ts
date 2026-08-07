import { expect, test } from "bun:test";
import type { WebClient } from "@slack/web-api";
import { SlackResponseStream } from "./stream.ts";

interface Call {
  method: string;
  args: Record<string, unknown>;
}

/** Minimal WebClient stand-in recording successful chat.* calls, optionally failing some. */
function fakeSlack(failOn: string[] = []) {
  const calls: Call[] = [];
  const record = (method: string) => async (args: Record<string, unknown>) => {
    if (failOn.includes(method)) throw new Error(`${method} failed`);
    calls.push({ method, args });
    return { ok: true, ts: "111.222" };
  };
  const client = {
    chat: {
      startStream: record("startStream"),
      appendStream: record("appendStream"),
      stopStream: record("stopStream"),
      postMessage: record("postMessage"),
    },
  };
  return { client: client as unknown as WebClient, calls };
}

const target = { channel: "C1", threadTs: "1.1", userId: "U1", teamId: "T1" };

/** Let queued stream calls settle, as they would between agent turns. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function textOf(call: Call): string {
  const chunks = call.args.chunks as Array<{ type: string; text?: string }> | undefined;
  return (chunks ?? [])
    .filter((c) => c.type === "markdown_text")
    .map((c) => c.text)
    .join("");
}

test("short responses post a plain message instead of streaming", async () => {
  const { client, calls } = fakeSlack();
  const stream = new SlackResponseStream(client, target);

  stream.appendText("all set");
  await stream.finish("fallback");

  expect(calls.map((c) => c.method)).toEqual(["postMessage"]);
  expect(calls[0]!.args.markdown_text).toBe("all set");
});

test("empty responses post the fallback text", async () => {
  const { client, calls } = fakeSlack();
  const stream = new SlackResponseStream(client, target);

  await stream.finish("fallback");

  expect(calls[0]!.args.markdown_text).toBe("fallback");
});

test("long responses stream in order and deliver every character once", async () => {
  const { client, calls } = fakeSlack();
  const stream = new SlackResponseStream(client, target);

  const deltas = Array.from({ length: 40 }, (_, i) => `chunk-${i} `.padEnd(60, "."));
  for (const delta of deltas) stream.appendText(delta);
  await stream.finish("fallback");

  expect(calls[0]!.method).toBe("startStream");
  expect(calls.at(-1)!.method).toBe("stopStream");
  expect(calls.some((c) => c.method === "postMessage")).toBe(false);
  expect(calls.map(textOf).join("")).toBe(deltas.join(""));
});

test("tool progress is streamed as task updates", async () => {
  const { client, calls } = fakeSlack();
  const stream = new SlackResponseStream(client, target);

  stream.appendText("looking...");
  stream.updateTask({ id: "t1", title: "Searching Sonarr", status: "in_progress" });
  stream.updateTask({ id: "t1", title: "Searching Sonarr", status: "complete" });
  await stream.finish("fallback");

  const tasks = calls.flatMap(
    (c) => (c.args.chunks as Array<{ type: string; status?: string }>) ?? [],
  );
  expect(tasks.filter((t) => t.type === "task_update").map((t) => t.status)).toEqual([
    "in_progress",
    "complete",
  ]);
});

test("a failed append delivers the remainder when the stream is stopped", async () => {
  const { client, calls } = fakeSlack(["appendStream"]);
  const stream = new SlackResponseStream(client, target);

  stream.appendText("a".repeat(600));
  await settle();
  stream.updateTask({ id: "t1", title: "Searching Sonarr", status: "in_progress" });
  stream.appendText("b".repeat(600));
  await stream.finish("fallback");

  expect(calls.some((c) => c.method === "postMessage")).toBe(false);
  expect(calls.map(textOf).join("")).toBe("a".repeat(600) + "b".repeat(600));
});

test("a fully broken stream posts only the undelivered text", async () => {
  const { client, calls } = fakeSlack(["appendStream", "stopStream"]);
  const stream = new SlackResponseStream(client, target);

  stream.appendText("a".repeat(600));
  await settle();
  stream.appendText("b".repeat(600));
  await stream.finish("fallback");

  expect(textOf(calls[0]!)).toBe("a".repeat(600));
  const posted = calls.find((c) => c.method === "postMessage");
  expect(posted!.args.markdown_text).toBe("b".repeat(600));
});

test("a stream that never starts falls back to the full text", async () => {
  const { client, calls } = fakeSlack(["startStream"]);
  const stream = new SlackResponseStream(client, target);

  stream.appendText("a".repeat(600));
  await stream.finish("fallback");

  const posted = calls.find((c) => c.method === "postMessage");
  expect(posted!.args.markdown_text).toBe("a".repeat(600));
});

test("paragraphs separate consecutive assistant messages", async () => {
  const { client, calls } = fakeSlack();
  const stream = new SlackResponseStream(client, target);

  stream.newParagraph(); // no-op before any text
  stream.appendText("first");
  stream.newParagraph();
  stream.appendText("second");
  await stream.finish("fallback");

  expect(calls[0]!.args.markdown_text).toBe("first\n\nsecond");
});
