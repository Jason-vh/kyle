import type { AssistantMessage, Message, ToolCall, ToolResultMessage } from "@earendil-works/pi-ai";
import type { AgentEvent, EntryRecord, SnapshotEvent } from "@earendil-works/pi-durable";

/** What the interfaces show of a turn while it runs. */
export type TurnEvent =
  | { type: "assistant_start" }
  | { type: "text_delta"; delta: string }
  | { type: "tool_start"; toolCallId: string; toolName: string; args: Record<string, unknown> }
  | {
      type: "tool_end";
      toolCallId: string;
      toolName: string;
      isError: boolean;
      content: ToolResultMessage["content"];
    };

function assistantText(message: Message | undefined): string {
  if (message?.role !== "assistant") return "";
  return (message as AssistantMessage).content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("");
}

/**
 * Translates pi-durable's experimental agent events, so only this file follows
 * their changes. Partial answers are committed at intervals, so the deltas seen
 * may stop short of the answer; the rest is sent when the answer is complete.
 *
 * A listener that falls behind has its undelivered batches replaced by one
 * snapshot, so the snapshot is replayed against what was already said: entries
 * from before the turn are passed in as `history` and never repeated.
 */
export function createTurnEventTranslator(
  history: readonly EntryRecord[] = [],
): (event: AgentEvent) => TurnEvent[] {
  const accounted = new Set(history.map((entry) => entry.id));
  const startedTools = new Set<string>();
  const endedTools = new Set<string>();
  let answering = false;
  let streamed = "";

  function textSoFar(text: string): TurnEvent[] {
    if (!text.startsWith(streamed) || text.length === streamed.length) return [];
    const delta = text.slice(streamed.length);
    streamed = text;
    return [{ type: "text_delta", delta }];
  }

  function startAnswer(text: string): TurnEvent[] {
    answering = true;
    streamed = "";
    return [{ type: "assistant_start" }, ...textSoFar(text)];
  }

  /** Continues the answer under way, or starts another when the one seen has moved on. */
  function catchUp(text: string): TurnEvent[] {
    if (answering && text.startsWith(streamed)) return textSoFar(text);
    return startAnswer(text);
  }

  function toolStart(call: Pick<ToolCall, "id" | "name" | "arguments">): TurnEvent[] {
    if (startedTools.has(call.id)) return [];
    startedTools.add(call.id);
    return [{ type: "tool_start", toolCallId: call.id, toolName: call.name, args: call.arguments }];
  }

  function toolEnd(toolCallId: string, toolName: string, entry?: EntryRecord): TurnEvent[] {
    if (entry) accounted.add(entry.id);
    if (endedTools.has(toolCallId)) return [];
    endedTools.add(toolCallId);
    const result = entry?.model?.[0] as ToolResultMessage | undefined;
    return [
      {
        type: "tool_end",
        toolCallId,
        toolName,
        isError: result?.isError ?? true,
        content: result?.content ?? [],
      },
    ];
  }

  function replay(snapshot: SnapshotEvent): TurnEvent[] {
    const events: TurnEvent[] = [];

    for (const entry of snapshot.entries) {
      if (accounted.has(entry.id)) continue;
      accounted.add(entry.id);

      const message = entry.model?.[0];
      if (message?.role === "assistant") {
        events.push(...catchUp(assistantText(message)));
        answering = false;
        for (const block of message.content) {
          if (block.type === "toolCall") events.push(...toolStart(block));
        }
      }
      if (message?.role === "toolResult") {
        events.push(...toolEnd(message.toolCallId, message.toolName, entry));
      }
    }

    const partial = snapshot.generation?.message;
    if (partial) events.push(...catchUp(assistantText(partial)));
    return events;
  }

  return (event) => {
    switch (event.type) {
      case "snapshot":
        return replay(event);
      case "message_start":
        if (event.message.role !== "assistant") return [];
        return startAnswer(assistantText(event.message));
      case "message_update":
        return event.changes.flatMap((change) =>
          change.type === "text_delta" ? textSoFar(streamed + change.delta) : [],
        );
      case "message_end": {
        if (accounted.has(event.entry.id)) return [];
        accounted.add(event.entry.id);
        const message = event.entry.model?.[0];
        if (message?.role !== "assistant") return [];
        const events = catchUp(assistantText(message));
        answering = false;
        return events;
      }
      case "tool_execution_start":
        return toolStart({ id: event.toolCallId, name: event.toolName, arguments: event.args });
      case "tool_execution_end":
        return toolEnd(event.toolCallId, event.toolName, event.entry);
      default:
        return [];
    }
  };
}
