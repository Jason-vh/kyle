import { describe, expect, test } from "bun:test";
import type { AssistantMessage, Message, ToolResultMessage } from "@earendil-works/pi-ai";
import type { AgentEvent, EntryRecord, SnapshotEvent } from "@earendil-works/pi-durable";
import { createTurnEventTranslator, type TurnEvent } from "./turn-events.ts";

function assistant(text: string, toolCalls: { id: string; name: string }[] = []): AssistantMessage {
  return {
    role: "assistant",
    content: [
      ...(text ? [{ type: "text" as const, text }] : []),
      ...toolCalls.map((call) => ({ type: "toolCall" as const, ...call, arguments: {} })),
    ],
  } as unknown as AssistantMessage;
}

function toolResult(toolCallId: string, toolName: string): ToolResultMessage {
  return {
    role: "toolResult",
    toolCallId,
    toolName,
    isError: false,
    content: [{ type: "text", text: "{}" }],
  } as unknown as ToolResultMessage;
}

function entry(id: string, message: Message): EntryRecord {
  return { id, conversationId: "c1", kind: "message", model: [message] } as unknown as EntryRecord;
}

function snapshot(entries: EntryRecord[], partial?: AssistantMessage): SnapshotEvent {
  return {
    type: "snapshot",
    entries,
    generation: partial ? { attempt: 1, message: partial } : undefined,
  } as unknown as SnapshotEvent;
}

const start = (text = ""): AgentEvent =>
  ({ type: "message_start", message: assistant(text) }) as unknown as AgentEvent;
const delta = (text: string): AgentEvent =>
  ({
    type: "message_update",
    changes: [{ type: "text_delta", contentIndex: 0, delta: text }],
  }) as unknown as AgentEvent;
const update = (...changes: unknown[]): AgentEvent =>
  ({ type: "message_update", changes }) as unknown as AgentEvent;
const end = (record: EntryRecord): AgentEvent =>
  ({ type: "message_end", entry: record }) as unknown as AgentEvent;

function run(events: AgentEvent[], history: EntryRecord[] = []): TurnEvent[] {
  const translate = createTurnEventTranslator(history);
  return events.flatMap(translate);
}

function said(events: TurnEvent[]): string {
  return events.map((event) => (event.type === "text_delta" ? event.delta : "")).join("");
}

function answers(events: TurnEvent[]): number {
  return events.filter((event) => event.type === "assistant_start").length;
}

const reply = "Here is the plan. I haven't deleted anything yet.";

describe("createTurnEventTranslator", () => {
  test("streams an answer once, however it arrives", () => {
    const events = run([
      start(),
      delta("Here is "),
      delta("the plan."),
      end(entry("a1", assistant(reply))),
    ]);

    expect(said(events)).toBe(reply);
    expect(answers(events)).toBe(1);
  });

  test("takes text a batch carried whole, not only its deltas", () => {
    const events = run([
      start(),
      update(
        { type: "thinking_start", contentIndex: 0, block: { type: "thinking", thinking: "" } },
        { type: "text_start", contentIndex: 1, block: { type: "text", text: "Here is " } },
      ),
      update({
        type: "block",
        contentIndex: 1,
        block: { type: "text", text: "Here is the plan." },
      }),
      update({ type: "text_delta", contentIndex: 1, delta: " I haven't" }),
      update({ type: "message", message: assistant("Here is the plan. I haven't deleted") }),
      update({ type: "text_delta", contentIndex: 0, delta: " anything yet." }),
      end(entry("a1", assistant(reply))),
    ]);

    expect(said(events)).toBe(reply);
    expect(answers(events)).toBe(1);
  });

  test("picks the answer up from a snapshot that replaced its middle", () => {
    const events = run([
      start(),
      delta("Here "),
      snapshot([], assistant("Here is the plan.")),
      delta(" I haven't"),
      end(entry("a1", assistant(reply))),
    ]);

    expect(said(events)).toBe(reply);
    expect(answers(events)).toBe(1);
  });

  test("recovers an answer whose start and tools only a snapshot saw", () => {
    const history = [entry("old", assistant("Something said yesterday"))];
    const lookup = assistant("", [{ id: "call-1", name: "get_ultra_stats" }]);

    const events = run(
      [
        snapshot(
          [...history, entry("a1", lookup), entry("r1", toolResult("call-1", "get_ultra_stats"))],
          assistant("Here is the plan."),
        ),
        delta(" I haven't deleted anything yet."),
        end(entry("a2", assistant(reply))),
      ],
      history,
    );

    expect(said(events)).toBe(reply);
    expect(
      events.filter((event) => event.type !== "text_delta").map((event) => event.type),
    ).toEqual(["assistant_start", "tool_start", "tool_end", "assistant_start"]);
  });

  test("says a finished answer the snapshot holds once, even if its end arrives too", () => {
    const final = entry("a1", assistant(reply));

    const events = run([start(), delta("Here "), snapshot([final]), end(final)]);

    expect(said(events)).toBe(reply);
    expect(answers(events)).toBe(1);
  });
});
